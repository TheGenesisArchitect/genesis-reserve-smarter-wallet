import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, createWalletClient, http, isAddress } from 'viem'
import { arbitrum } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { CONTRACTS } from '../../../../../config/contracts'
import { executeContractCall, pollTransaction } from '../../_lib/circle-wallets'

const RPC_URL = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'

const STRATEGY_ROUTER = (
    (process.env.NEXT_PUBLIC_STRATEGY_ROUTER_ADDRESS || '').trim() || CONTRACTS.STRATEGY_ROUTER
) as `0x${string}`

// keccak256("VAULT_ROLE") — role required to call harvest() on StrategyRouter
const VAULT_ROLE     = '0x31e0210044b4f6757ce6aa31f9c6e8d4896d24a755014887391a926c5224d959' as const
// keccak256("HARVESTER_ROLE") — alternative role checked as fallback
const HARVESTER_ROLE = '0x3fc733b4d20d27a28452ddf0e9351aced28242fe03389a653cdb783955316b9b' as const
// DEFAULT_ADMIN_ROLE (0x00...0)
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

        const circleWalletId = process.env.CIRCLE_ADMIN_WALLET_ID
        const hasCircleWallet = !!(circleWalletId && process.env.CIRCLE_ENTITY_SECRET)

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

        // ── Circle Programmable Wallet path ───────────────────────────────────
        // Preferred when EOA operator key is absent — Circle MPC signs on-chain
        if (!operatorKey && hasCircleWallet) {
            console.info('[vault/trigger-allocation] Using Circle admin wallet for harvest', {
                tier,
                wallet: walletAddress || 'unspecified',
            })

            const tx = await executeContractCall({
                walletId: circleWalletId!,
                contractAddress: STRATEGY_ROUTER,
                abiFunctionSignature: 'harvest()',
                abiParameters: [],
                feeLevel: 'HIGH',
            })

            const confirmed = await pollTransaction(tx.transactionId)

            console.info('[vault/trigger-allocation] Harvest executed via Circle', {
                transactionId: confirmed.transactionId,
                txHash: confirmed.txHash,
                tier,
                wallet: walletAddress || 'unspecified',
            })

            return NextResponse.json({
                status: 'harvested',
                txHash: confirmed.txHash ?? null,
                transactionId: confirmed.transactionId,
                signer: 'circle',
            })
        }

        // ── No signer configured ──────────────────────────────────────────────
        if (!operatorKey) {
            if (DEV_BYPASS) {
                console.warn('[vault/trigger-allocation] No operator key — dev bypass for', walletAddress || 'anon', 'tier:', tier)
                return NextResponse.json({
                    status: 'bypassed',
                    txHash: null,
                    detail: 'Set GENESIS_VAULT_OPERATOR_PRIVATE_KEY or configure CIRCLE_ADMIN_WALLET_ID + CIRCLE_ENTITY_SECRET to trigger on-chain harvest in production',
                })
            }
            return NextResponse.json(
                {
                    error: 'Operator key not configured',
                    detail: 'Set GENESIS_VAULT_OPERATOR_PRIVATE_KEY for an address with VAULT_ROLE on StrategyRouter, or configure Circle admin wallet via POST /api/gr/admin/setup-wallet',
                },
                { status: 503 }
            )
        }

        // ── EOA operator key path ─────────────────────────────────────────────
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
                    detail: `Signer ${account.address} needs VAULT_ROLE on StrategyRouter. Use POST /api/gr/admin/grant-router-role to grant VAULT_ROLE via the Circle admin wallet.`,
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

        console.info('[vault/trigger-allocation] Harvest executed via EOA', {
            txHash: hash,
            block: receipt.blockNumber.toString(),
            tier,
            wallet: walletAddress || 'unspecified',
        })

        return NextResponse.json({
            status: 'harvested',
            txHash: hash,
            blockNumber: receipt.blockNumber.toString(),
            signer: 'eoa',
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[vault/trigger-allocation] Error:', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
