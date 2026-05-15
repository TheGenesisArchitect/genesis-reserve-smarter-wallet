import { NextResponse } from 'next/server'
import { createPublicClient, http, parseEther, parseUnits } from 'viem'
import { arbitrum } from 'viem/chains'
import { createRateLimiter, createTtlCache, getRequestIp } from '../../_lib/request-controls'

// ── Uniswap V3 on Arbitrum One ────────────────────────────────────────────────
const QUOTER_V2 = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e' as const
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as const
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const

// Try 0.05% (500) first — highest liquidity for ETH/USDC on Arbitrum
// Fall back to 0.3% (3000) if 500 pool reverts
const FEE_TIERS = [500, 3000] as const

const QUOTER_ABI = [
  {
    name: 'quoteExactInputSingle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{
      name: 'params',
      type: 'tuple',
      components: [
        { name: 'tokenIn', type: 'address' },
        { name: 'tokenOut', type: 'address' },
        { name: 'amountIn', type: 'uint256' },
        { name: 'fee', type: 'uint24' },
        { name: 'sqrtPriceLimitX96', type: 'uint160' },
      ],
    }],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const

const parseRpcList = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map(v => v.trim())
    .filter(v => v.length > 0)

const rpcCandidates = Array.from(new Set([
  ...(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL && !process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL.includes('PASTE')
    ? [process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL]
    : []),
  ...parseRpcList(process.env.NEXT_PUBLIC_ARBITRUM_RPC_FALLBACKS),
  'https://arb1.arbitrum.io/rpc',
]))

const quoteCache = createTtlCache<unknown>()
const rateLimiter = createRateLimiter(30, 60_000)
const CACHE_TTL_MS = 8_000

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const direction = searchParams.get('direction') // 'eth_to_usdc' | 'usdc_to_eth'
  const amountInStr = searchParams.get('amountIn')

  const requesterIp = getRequestIp(request)
  if (rateLimiter.isLimited(requesterIp)) {
    return NextResponse.json({ error: 'rate_limited', detail: 'Too many quote requests. Please retry shortly.' }, { status: 429 })
  }

  if (!direction || !amountInStr) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 })
  }

  const cacheKey = `${direction}:${amountInStr}`
  const cached = quoteCache.get(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        'cache-control': 'private, max-age=8',
        'x-rpc-cache': 'hit',
      },
    })
  }

  const isEthToUsdc = direction === 'eth_to_usdc'
  const tokenIn = isEthToUsdc ? WETH : USDC
  const tokenOut = isEthToUsdc ? USDC : WETH

  let amountIn: bigint
  try {
    amountIn = isEthToUsdc
      ? parseEther(amountInStr)
      : parseUnits(amountInStr, 6)
  } catch {
    return NextResponse.json({ error: 'invalid_amount' }, { status: 400 })
  }

  // Try each RPC and fee tier, return best quote.
  let bestAmountOut: bigint | null = null
  let bestFee = 500
  let rpcSource = 'unavailable'

  for (const rpcUrl of rpcCandidates) {
    const client = createPublicClient({
      chain: arbitrum,
      transport: http(rpcUrl, { retryCount: 1, retryDelay: 200, timeout: 4_000 }),
    })

    for (const fee of FEE_TIERS) {
      try {
        const result = await client.readContract({
          address: QUOTER_V2,
          abi: QUOTER_ABI,
          functionName: 'quoteExactInputSingle',
          args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
        }) as readonly [bigint, bigint, number, bigint]
        const amountOut = result[0]
        if (bestAmountOut === null || amountOut > bestAmountOut) {
          bestAmountOut = amountOut
          bestFee = fee
          rpcSource = rpcUrl
        }
      } catch {
        // Pool may not exist at this fee tier, or RPC failed. Try next option.
      }
    }

    if (bestAmountOut !== null) break
  }

  if (bestAmountOut === null) {
    return NextResponse.json({ error: 'no_liquidity' }, { status: 422 })
  }

  // Format output
  const amountOutFormatted = isEthToUsdc
    ? (Number(bestAmountOut) / 1e6).toFixed(6)
    : (Number(bestAmountOut) / 1e18).toFixed(8)

  // Derive exchange rate (USDC per ETH or ETH per USDC)
  const rate = isEthToUsdc
    ? (Number(bestAmountOut) / 1e6) / Number(parseFloat(amountInStr))
    : (Number(bestAmountOut) / 1e18) / Number(parseFloat(amountInStr))

  const payload = {
    direction,
    amountIn: amountInStr,
    amountOut: amountOutFormatted,
    amountOutRaw: bestAmountOut.toString(),
    fee: bestFee,
    rate: rate.toFixed(isEthToUsdc ? 2 : 8),
    rpcSource,
    fetchedAt: new Date().toISOString(),
  }

  quoteCache.set(cacheKey, payload, CACHE_TTL_MS)

  return NextResponse.json(payload, {
    headers: {
      'cache-control': 'private, max-age=8',
      'x-rpc-cache': 'miss',
    },
  })
}
