// POST /api/gr/admin/setup-wallet
//
// One-time bootstrap for the Circle Developer-Controlled admin wallet.
// Call once after setting CIRCLE_API_KEY in Vercel.
//
// Steps:
//  1. Generates a 32-byte entity secret (or reuses if already registered)
//  2. Registers the entity with Circle's w3s API
//  3. Creates a wallet set named "Genesis Admin"
//  4. Creates a developer-controlled wallet on Arbitrum
//  5. Returns the wallet address + IDs to persist in Vercel env
//
// After calling this endpoint, add to Vercel env:
//   CIRCLE_ENTITY_SECRET       — returned as entitySecret
//   CIRCLE_WALLET_SET_ID       — returned as walletSetId
//   CIRCLE_ADMIN_WALLET_ID     — returned as walletId
//   CIRCLE_ADMIN_WALLET_ADDRESS — returned as walletAddress
//
// Then: have the current Router DEFAULT_ADMIN call grantRole(DEFAULT_ADMIN, walletAddress)
// on StrategyRouter — after which call POST /api/gr/admin/grant-router-role to complete setup.

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import {
    getEntityPublicKey,
    encryptEntitySecret,
    createWalletSet,
    createWallet,
} from '../../_lib/circle-wallets'

const ADMIN_API_KEY = process.env.GENESIS_ADMIN_API_KEY

export async function POST(req: NextRequest) {
    // Protect with admin API key
    const auth = req.headers.get('x-admin-key') || req.headers.get('authorization')?.replace('Bearer ', '')
    if (!ADMIN_API_KEY || auth !== ADMIN_API_KEY) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        // Validate Circle API key is present
        if (!process.env.CIRCLE_API_KEY) {
            return NextResponse.json(
                { error: 'CIRCLE_API_KEY not set in environment' },
                { status: 503 }
            )
        }

        // If entity secret already configured, skip registration
        let entitySecretHex = process.env.CIRCLE_ENTITY_SECRET?.trim() || ''
        let registered = false

        if (!entitySecretHex) {
            // Generate fresh 32-byte entity secret
            entitySecretHex = crypto.randomBytes(32).toString('hex')
            // Register with Circle
            const publicKey = await getEntityPublicKey()
            const ciphertext = encryptEntitySecret(entitySecretHex, publicKey)
            const registerRes = await fetch('https://api.circle.com/v1/w3s/config/entity', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.CIRCLE_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ recoveryFile: ciphertext }),
            })
            if (!registerRes.ok) {
                const err = await registerRes.json()
                throw new Error(`Entity registration failed: ${JSON.stringify(err)}`)
            }
            registered = true
        }

        // Create wallet set (idempotent name — Circle dedupes by name within account)
        const walletSetName = 'Genesis Admin'
        let walletSetId = process.env.CIRCLE_WALLET_SET_ID?.trim() || ''
        if (!walletSetId) {
            // Temporarily override env for the service layer
            process.env.CIRCLE_ENTITY_SECRET = entitySecretHex
            const ws = await createWalletSet(walletSetName)
            walletSetId = ws.walletSetId
        }

        // Create the admin wallet
        let walletId = process.env.CIRCLE_ADMIN_WALLET_ID?.trim() || ''
        let walletAddress = process.env.CIRCLE_ADMIN_WALLET_ADDRESS?.trim() || ''

        if (!walletId || !walletAddress) {
            process.env.CIRCLE_ENTITY_SECRET = entitySecretHex
            const w = await createWallet(walletSetId, 'genesis-admin-deployer')
            walletId = w.walletId
            walletAddress = w.address
        }

        return NextResponse.json({
            status: 'ready',
            registered,
            instructions: [
                '1. Add the following to Vercel env (Production + Preview):',
                `   CIRCLE_ENTITY_SECRET = ${entitySecretHex}`,
                `   CIRCLE_WALLET_SET_ID = ${walletSetId}`,
                `   CIRCLE_ADMIN_WALLET_ID = ${walletId}`,
                `   CIRCLE_ADMIN_WALLET_ADDRESS = ${walletAddress}`,
                '2. From the current Router DEFAULT_ADMIN, call:',
                `   StrategyRouter.grantRole(DEFAULT_ADMIN_ROLE, ${walletAddress})`,
                '   (0x0000...0000 is DEFAULT_ADMIN_ROLE)',
                '3. Redeploy, then POST /api/gr/admin/grant-router-role to finish.',
            ],
            entitySecret: entitySecretHex,
            walletSetId,
            walletId,
            walletAddress,
            contracts: {
                strategyRouter: '0xD7ff8383eBBE3B1023d95A3f14c32D9941Ac9e84',
                genesisVault: '0xe164997D48395B4e24aB0f9F66c57DEA38C5E041',
            },
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[admin/setup-wallet]', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
