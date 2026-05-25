// POST /api/gr/admin/grant-router-role
//
// Uses the Circle Developer-Controlled admin wallet to call:
//   StrategyRouter.grantRole(VAULT_ROLE, 0x07CA9DC1...)
//
// Prerequisites:
//   - CIRCLE_ENTITY_SECRET, CIRCLE_ADMIN_WALLET_ID set in env (from setup-wallet)
//   - StrategyRouter DEFAULT_ADMIN has called grantRole(DEFAULT_ADMIN, circleWalletAddress)
//
// The body can specify a custom grantee; defaults to GENESIS_VAULT_OPERATOR_ADDRESS env var.

import { NextRequest, NextResponse } from 'next/server'
import { executeContractCall, pollTransaction } from '../../_lib/circle-wallets'

const ADMIN_API_KEY = process.env.GENESIS_ADMIN_API_KEY
const STRATEGY_ROUTER = '0xD7ff8383eBBE3B1023d95A3f14c32D9941Ac9e84'

// keccak256("VAULT_ROLE") — controls harvest() on StrategyRouter
const VAULT_ROLE = '0x31e0210044b4f6757ce6aa31f9c6e8d4896d24a755014887391a926c5224d959'
// DEFAULT_ADMIN_ROLE
const DEFAULT_ADMIN = '0x0000000000000000000000000000000000000000000000000000000000000000'

export async function POST(req: NextRequest) {
    const auth = req.headers.get('x-admin-key') || req.headers.get('authorization')?.replace('Bearer ', '')
    if (!ADMIN_API_KEY || auth !== ADMIN_API_KEY) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = await req.json().catch(() => ({})) as { grantee?: string; role?: string }

        const adminWalletId = process.env.CIRCLE_ADMIN_WALLET_ID
        if (!adminWalletId) {
            return NextResponse.json(
                { error: 'CIRCLE_ADMIN_WALLET_ID not set — run /api/gr/admin/setup-wallet first' },
                { status: 503 }
            )
        }

        if (!process.env.CIRCLE_ENTITY_SECRET) {
            return NextResponse.json(
                { error: 'CIRCLE_ENTITY_SECRET not set — run /api/gr/admin/setup-wallet first' },
                { status: 503 }
            )
        }

        // Grantee: body param, or the new operator address from env
        const grantee = (body.grantee || process.env.CIRCLE_ADMIN_WALLET_ADDRESS || '').trim()
        const newOperator = '0x07CA9DC1e7644FA6699E7A5f8e7B3b53F94f7A2c'

        // Role: VAULT_ROLE by default, DEFAULT_ADMIN if explicitly requested
        const roleHash = body.role === 'DEFAULT_ADMIN' ? DEFAULT_ADMIN : VAULT_ROLE
        const roleName  = body.role === 'DEFAULT_ADMIN' ? 'DEFAULT_ADMIN' : 'VAULT_ROLE'

        // Target grantee: VAULT_ROLE → new operator; DEFAULT_ADMIN → Circle wallet address (self-setup)
        const targetGrantee = (roleHash === VAULT_ROLE ? newOperator : grantee) as `0x${string}`

        if (!targetGrantee || !/^0x[0-9a-fA-F]{40}$/.test(targetGrantee)) {
            return NextResponse.json(
                { error: 'Invalid or missing grantee address' },
                { status: 400 }
            )
        }

        console.info(`[grant-router-role] Granting ${roleName} to ${targetGrantee} on StrategyRouter via Circle wallet ${adminWalletId}`)

        const tx = await executeContractCall({
            walletId: adminWalletId,
            contractAddress: STRATEGY_ROUTER,
            abiFunctionSignature: 'grantRole(bytes32,address)',
            abiParameters: [roleHash, targetGrantee],
            feeLevel: 'HIGH',
        })

        // Poll until confirmed (up to 90s)
        const confirmed = await pollTransaction(tx.transactionId)

        return NextResponse.json({
            status: 'granted',
            role: roleName,
            grantee: targetGrantee,
            contract: STRATEGY_ROUTER,
            transactionId: confirmed.transactionId,
            txHash: confirmed.txHash,
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[admin/grant-router-role]', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
