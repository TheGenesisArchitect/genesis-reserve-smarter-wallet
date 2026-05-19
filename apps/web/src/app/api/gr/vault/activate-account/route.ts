import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, createWalletClient, getAddress, http, isAddress } from 'viem'
import { arbitrum } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { CONTRACTS } from '../../../../../config/contracts'

const RPC_URL = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'

// Use contracts.ts as canonical source — env var is override only.
// This prevents address drift when the env lags behind a redeployment.
const GENESIS_VAULT = (
    (process.env.NEXT_PUBLIC_GENESIS_VAULT_ADDRESS || '').trim() || CONTRACTS.GENESIS_VAULT
) as `0x${string}`
const COMPLIANCE_REGISTRY = (
    (process.env.NEXT_PUBLIC_COMPLIANCE_REGISTRY_ADDRESS || '').trim() || CONTRACTS.COMPLIANCE_REGISTRY
) as `0x${string}`

const OPERATOR_ROLE = '0x97667070c54ef182b0f5858b034beac1b6f3089aa2d3188bb1e8929f4fa9b929' as const // keccak256("OPERATOR_ROLE") — verified on-chain

// Mirror the KYC activate bypass: when the operator key is absent in local/dev,
// return a soft-bypass so the deposit flow can proceed for testing.
const VAULT_DEV_BYPASS =
    process.env.VAULT_ACTIVATION_DEV_BYPASS === 'true' ||
    process.env.NODE_ENV !== 'production'

const VAULT_ABI = [
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
    {
        name: 'policies',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [
            { name: 'mode', type: 'uint8' },
            { name: 'liquidBufferBps', type: 'uint128' },
            { name: 'maxSingleTxBps', type: 'uint128' },
            { name: 'kycLevel', type: 'uint64' },
            { name: 'riskTier', type: 'uint64' },
            { name: 'travelRuleRequired', type: 'bool' },
            { name: 'active', type: 'bool' },
        ],
    },
    {
        name: 'activateAccount',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'account', type: 'address' },
            { name: 'mode', type: 'uint8' },
            { name: 'kycLevel', type: 'uint64' },
            { name: 'riskTier', type: 'uint64' },
            { name: 'travelRuleRequired', type: 'bool' },
        ],
        outputs: [],
    },
] as const

const COMPLIANCE_ABI = [
    {
        name: 'records',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [
            { name: 'kycLevel', type: 'uint8' },
            { name: 'riskTier', type: 'uint8' },
            { name: 'sanctionStatus', type: 'bytes32' },
            { name: 'amlStatus', type: 'bytes32' },
            { name: 'jurisdiction', type: 'string' },
            { name: 'pepFlag', type: 'bool' },
            { name: 'travelRuleRequired', type: 'bool' },
            { name: 'active', type: 'bool' },
            { name: 'kycExpiry', type: 'uint64' },
            { name: 'lastScreening', type: 'uint64' },
            { name: 'dailyVolumeUsed', type: 'uint256' },
            { name: 'dailyVolumeReset', type: 'uint256' },
            { name: 'kycProviderRef', type: 'bytes32' },
            { name: 'amlProviderRef', type: 'bytes32' },
        ],
    },
] as const

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({})) as { address?: string }
        const rawAddress = String(body?.address || '')

        if (!isAddress(rawAddress)) {
            return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
        }

        if (!isAddress(GENESIS_VAULT) || !isAddress(COMPLIANCE_REGISTRY)) {
            return NextResponse.json({ error: 'Vault/compliance addresses are not configured' }, { status: 503 })
        }

        const operatorKey = process.env.GENESIS_VAULT_OPERATOR_PRIVATE_KEY
            || process.env.GENESIS_OPERATOR_PRIVATE_KEY
            || process.env.COMPLIANCE_ADMIN_PRIVATE_KEY

        if (!operatorKey) {
            if (VAULT_DEV_BYPASS) {
                console.warn('[vault/activate-account] No operator key — returning dev bypass for', rawAddress)
                return NextResponse.json({
                    status: 'activated',
                    mode: 'dev_bypass',
                    txHash: null,
                    blockNumber: null,
                    detail: 'Set GENESIS_VAULT_OPERATOR_PRIVATE_KEY in production to activate on-chain',
                })
            }
            return NextResponse.json(
                {
                    error: 'Vault operator key not configured',
                    detail: 'Set GENESIS_VAULT_OPERATOR_PRIVATE_KEY for an address with OPERATOR_ROLE on GenesisVault',
                },
                { status: 503 }
            )
        }

        const address = getAddress(rawAddress)
        const publicClient = createPublicClient({ chain: arbitrum, transport: http(RPC_URL) })

        const policy = await publicClient.readContract({
            address: GENESIS_VAULT,
            abi: VAULT_ABI,
            functionName: 'policies',
            args: [address],
        }) as readonly unknown[]

        const alreadyActive = Boolean(policy?.[6])
        if (alreadyActive) {
            return NextResponse.json({ status: 'already_active' })
        }

        const compliance = await publicClient.readContract({
            address: COMPLIANCE_REGISTRY,
            abi: COMPLIANCE_ABI,
            functionName: 'records',
            args: [address],
        }) as readonly unknown[]

        const kycLevel = BigInt(Number(compliance?.[0] ?? 0))
        const riskTier = BigInt(Number(compliance?.[1] ?? 1))
        const complianceActive = Boolean(compliance?.[7])
        const travelRuleRequired = Boolean(compliance?.[6])

        if (!complianceActive || kycLevel < 1n) {
            // In dev/staging the KYC route may have returned a dev bypass without writing
            // on-chain, so the compliance record is still zero. Skip the gate here too.
            if (VAULT_DEV_BYPASS) {
                console.warn('[vault/activate-account] Compliance not active on-chain — returning dev bypass for', rawAddress)
                return NextResponse.json({
                    status: 'activated',
                    mode: 'dev_bypass',
                    txHash: null,
                    blockNumber: null,
                    detail: 'KYC was a dev bypass — skipping vault on-chain activation in non-production',
                })
            }
            return NextResponse.json(
                { status: 'kyc_required', detail: 'Compliance record is not active for this wallet.' },
                { status: 409 }
            )
        }

        const account = privateKeyToAccount(operatorKey as `0x${string}`)
        const walletClient = createWalletClient({ account, chain: arbitrum, transport: http(RPC_URL) })

        const signerHasOperatorRole = await publicClient.readContract({
            address: GENESIS_VAULT,
            abi: VAULT_ABI,
            functionName: 'hasRole',
            args: [OPERATOR_ROLE, account.address],
        }) as boolean

        if (!signerHasOperatorRole) {
            return NextResponse.json(
                {
                    status: 'operator_role_required',
                    detail: `Vault signer ${account.address} does not have OPERATOR_ROLE`,
                },
                { status: 409 }
            )
        }

        const hash = await walletClient.writeContract({
            address: GENESIS_VAULT,
            abi: VAULT_ABI,
            functionName: 'activateAccount',
            args: [address, 1, kycLevel, riskTier, travelRuleRequired],
        })

        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') {
            return NextResponse.json({ error: 'Vault account activation reverted' }, { status: 500 })
        }

        return NextResponse.json({
            status: 'activated',
            txHash: hash,
            blockNumber: receipt.blockNumber.toString(),
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[vault/activate-account] Error:', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
