import { NextResponse } from 'next/server'
import {
  createPublicClient,
  fallback,
  formatUnits,
  http,
  type Address,
  type Chain,
} from 'viem'
import { arbitrum, base, mainnet, optimism, polygon } from 'viem/chains'
import { CHAIN_USDC } from '../../../../config/contracts'

const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

const CHAIN_CONFIG = [
  { chainId: mainnet.id, chain: mainnet },
  { chainId: arbitrum.id, chain: arbitrum },
  { chainId: base.id, chain: base },
  { chainId: polygon.id, chain: polygon },
  { chainId: optimism.id, chain: optimism },
] as const

// Multiple RPCs per chain — tried in order; first success wins.
// Official chain RPCs first, then Llama (rate-limit friendly), then Ankr public as last resort.
const CHAIN_RPCS: Record<number, string[]> = {
  [mainnet.id]: [
    'https://cloudflare-eth.com',
    'https://eth.llamarpc.com',
    'https://rpc.ankr.com/eth',
  ],
  [arbitrum.id]: [
    'https://arb1.arbitrum.io/rpc',
    'https://arbitrum.llamarpc.com',
    'https://rpc.ankr.com/arbitrum',
  ],
  [base.id]: [
    'https://mainnet.base.org',
    'https://base.llamarpc.com',
    'https://rpc.ankr.com/base',
  ],
  [polygon.id]: [
    'https://polygon-rpc.com',
    'https://polygon.llamarpc.com',
    'https://rpc.ankr.com/polygon',
  ],
  [optimism.id]: [
    'https://mainnet.optimism.io',
    'https://optimism.llamarpc.com',
    'https://rpc.ankr.com/optimism',
  ],
}

function createChainClient(chain: Chain) {
  const rpcs = CHAIN_RPCS[chain.id] ?? [chain.rpcUrls.default.http[0]]
  return createPublicClient({
    chain,
    transport: fallback(
      rpcs.map((url) => http(url, { timeout: 4_000, retryCount: 0 })),
      { rank: false }
    ),
  })
}

type ChainBalance = { chainId: number; nativeAmount: number; usdcAmount: number }

/** Resolves to `fallback` instead of throwing when `promise` takes longer than `ms` */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

async function fetchChainBalance(chainId: number, address: string): Promise<ChainBalance> {
  const chainConfig = CHAIN_CONFIG.find((config) => config.chainId === chainId)
  if (!chainConfig) return { chainId, nativeAmount: 0, usdcAmount: 0 }

  const client = createChainClient(chainConfig.chain)
  const normalizedAddress = address as Address
  const usdcAddress = CHAIN_USDC[chainId]

  const [nativeResult, usdcResult] = await Promise.allSettled([
    client.getBalance({ address: normalizedAddress }),
    client.readContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [normalizedAddress],
    }),
  ])

  const nativeAmount =
    nativeResult.status === 'fulfilled'
      ? Number(formatUnits(nativeResult.value, 18))
      : 0

  const usdcAmount =
    usdcResult.status === 'fulfilled'
      ? Number(formatUnits(usdcResult.value, 6))
      : 0

  return {
    chainId,
    nativeAmount: Number.isFinite(nativeAmount) ? nativeAmount : 0,
    usdcAmount: Number.isFinite(usdcAmount) ? usdcAmount : 0,
  }
}

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address')

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: 'invalid_address' }, { status: 400 })
  }

  const results = await Promise.allSettled(
    CHAIN_CONFIG.map((config) =>
      withTimeout(
        fetchChainBalance(config.chainId, address),
        5000,
        { chainId: config.chainId, nativeAmount: 0, usdcAmount: 0 },
      )
    )
  )

  const balances: ChainBalance[] = results
    .filter((r): r is PromiseFulfilledResult<ChainBalance> => r.status === 'fulfilled')
    .map(r => r.value)

  return NextResponse.json(
    { address, balances, fetchedAt: new Date().toISOString() },
    { headers: { 'cache-control': 'private, max-age=30' } }
  )
}
