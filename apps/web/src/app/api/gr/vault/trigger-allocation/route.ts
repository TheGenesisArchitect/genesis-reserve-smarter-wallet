import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, createWalletClient, http, isAddress } from 'viem'
import { arbitrum } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { CONTRACTS } from '../../../../../config/contracts'

const RPC_URL = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'

const STRATEGY_ROUTER = (
    (process.env.NEXT_PUBLIC_STRATEGY_ROUTER_ADDRESS || '').trim() || CONTRACTS.STRATEGY_ROUTER
) as `0x${string}`

// keccak256("VAULT_ROLE") — role required to call harvest() on StrategyRouter.
// The Router grants this to the GenesisVault contract and the deployer.
// The Vercel operator also needs this role for out-of-band harvest.
const VAULT_ROLE     = '0x31e0210044b4f6757ce6aa31f9c6e8d4896d24a755014887391a926c5224d959' as const
// keccak256("HARVESTER_ROLE") — alternative role checked as fallback
const HARVESTER_ROLE = '0x3fc733b4d20d27a28452ddf0e9351aced28242fe03389a653cdb783955316b9b' as const
// DEFAULT_ADMIN (0x00...0) — deployer fallback
const DEFAULT_ADMIN  = '0x0000000000000000000000000000000000000000000000000000000000000000' as const

const DEV_BYPASS =
    process.env.VAULT_ACTIVATION_DEV_BYPASS === 'true' ||
    process.env.NODE_ENV !== 'production'

const ROUTER_ABI = [
    {
        name: 'harvest',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [],
        outputs: [],
    },
    {
        name: 'isCircuitBreakerActive',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: 'active', type: 'bool' }],
    },
    {
        name: 'hasRole',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'role', type: 'bytes32' },
            { name: 'account', type: 'address' },
        ],
        outputs: [{ name: '', type: 'bool' }],
    },
] as const

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({})) as { walletAddress?: string; tier?: string }
        const walletAddress = String(body?.walletAddress || '')
        const tier = String(body?.tier || 'grow')

        if (walletAddress && !isAddress(walletAddress)) {
            return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
        }

        if (!isAddress(STRATEGY_ROUTER)) {
            return NextResponse.json({ error: 'Strategy router address not configured' }, { status: 503 })
        }

        const operatorKey = process.env.GENESIS_VAULT_OPERATOR_PRIVATE_KEY
            || process.env.GENESIS_OPERATOR_PRIVATE_KEY

        if (!operatorKey) {
            if (DEV_BYPASS) {
                console.warn('[vault/trigger-allocation] No operator key — dev bypass for', walletAddress || 'anon', 'tier:', tier)
                return NextResponse.json({
                    status: 'bypassed',
                    txHash: null,
                    detail: 'Set GENESIS_VAULT_OPERATOR_PRIVATE_KEY to trigger on-chain harvest in production',
                })
            }
            return NextResponse.json(
                { error: 'Operator key not configured', detail: 'Set GENESIS_VAULT_OPERATOR_PRIVATE_KEY for an address with HARVESTER_ROLE or OPERATOR_ROLE on StrategyRouter' },
                { status: 503 }
            )
        }

        const publicClient = createPublicClient({ chain: arbitrum, transport: http(RPC_URL) })

        // Circuit breaker guard — never harvest when USDC is depegged
        const circuitOpen = await publicClient.readContract({
            address: STRATEGY_ROUTER,
            abi: ROUTER_ABI,
            functionName: 'isCircuitBreakerActive',
        }) as boolean

        if (circuitOpen) {
            return NextResponse.json(
                { status: 'circuit_breaker_active', detail: 'Strategy router circuit breaker is open — harvest blocked until USDC price recovers.' },
                { status: 409 }
            )
        }

        const account = privateKeyToAccount(operatorKey as `0x${string}`)

        // Verify signer has VAULT_ROLE, HARVESTER_ROLE, or DEFAULT_ADMIN on the Router
        const [hasVault, hasHarvester, hasAdmin] = await Promise.all([
            publicClient.readContract({
                address: STRATEGY_ROUTER,
                abi: ROUTER_ABI,
                functionName: 'hasRole',
                args: [VAULT_ROLE, account.address],
            }) as Promise<boolean>,
            publicClient.readContract({
                address: STRATEGY_ROUTER,
                abi: ROUTER_ABI,
                functionName: 'hasRole',
                args: [HARVESTER_ROLE, account.address],
            }) as Promise<boolean>,
            publicClient.readContract({
                address: STRATEGY_ROUTER,
                abi: ROUTER_ABI,
                functionName: 'hasRole',
                args: [DEFAULT_ADMIN, account.address],
            }) as Promise<boolean>,
        ])

        if (!hasVault && !hasHarvester && !hasAdmin) {
            return NextResponse.json(
                {
                    status: 'role_required',
                    detail: `Signer ${account.address} needs VAULT_ROLE or HARVESTER_ROLE on StrategyRouter. Ask the deployer (0x3e435c4dbb4e74119c4267d1f3b8335b31c80a0f) to call grantRole(VAULT_ROLE, ${account.address}) on the Router.`,
                },
                { status: 409 }
            )
        }

        const walletClient = createWalletClient({ account, chain: arbitrum, transport: http(RPC_URL) })

        const hash = await walletClient.writeContract({
            address: STRATEGY_ROUTER,
            abi: ROUTER_ABI,
            functionName: 'harvest',
            args: [],
        })

        const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
        if (receipt.status !== 'success') {
            return NextResponse.json({ error: 'Harvest transaction reverted' }, { status: 500 })
        }

        console.info('[vault/trigger-allocation] Harvest executed', {
            txHash: hash,
            block: receipt.blockNumber.toString(),
            tier,
            wallet: walletAddress || 'unspecified',
        })

        return NextResponse.json({
            status: 'harvested',
            txHash: hash,
            blockNumber: receipt.blockNumber.toString(),
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[vault/trigger-allocation] Error:', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
