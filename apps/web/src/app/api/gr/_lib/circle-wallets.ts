// circle-wallets.ts — Circle Developer-Controlled Wallets service
//
// Wraps Circle's Web3 Services (w3s) API for server-side wallet operations.
// Used to hold the Genesis admin/deployer role so no private key is ever
// stored in code or env vars — Circle's MPC infrastructure signs instead.
//
// Required env vars (set via Vercel):
//   CIRCLE_API_KEY           — Circle API key (must have w3s scope)
//   CIRCLE_ENTITY_SECRET     — 32-byte hex, generated once during setup
//   CIRCLE_WALLET_SET_ID     — wallet set ID, returned during setup
//   CIRCLE_ADMIN_WALLET_ID   — wallet ID of the admin wallet
//
// One-time setup: POST /api/gr/admin/setup-wallet (requires only CIRCLE_API_KEY)

import crypto from 'crypto'

const CIRCLE_BASE = 'https://api.circle.com/v1/w3s'

function apiKey() {
    const key = process.env.CIRCLE_API_KEY
    if (!key) throw new Error('CIRCLE_API_KEY not configured')
    return key
}

function entitySecret() {
    const s = process.env.CIRCLE_ENTITY_SECRET
    if (!s) throw new Error('CIRCLE_ENTITY_SECRET not configured — run /api/gr/admin/setup-wallet first')
    return s
}

async function circleRequest(method: string, path: string, body?: unknown) {
    const res = await fetch(`${CIRCLE_BASE}${path}`, {
        method,
        headers: {
            'Authorization': `Bearer ${apiKey()}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json() as Record<string, unknown>
    if (!res.ok) {
        throw new Error(`Circle API ${method} ${path} → ${res.status}: ${JSON.stringify(data)}`)
    }
    return data
}

// ── Entity public key (fresh per-request, used to encrypt entity secret) ──────

export async function getEntityPublicKey(): Promise<string> {
    const data = await circleRequest('GET', '/config/entity/publicKey') as { data?: { publicKey?: string } }
    const key = data?.data?.publicKey
    if (!key) throw new Error('Circle returned no entity public key')
    return key
}

// ── Encrypt entity secret with Circle's RSA-OAEP public key ─────────────────

export function encryptEntitySecret(secret: string, publicKeyPem: string): string {
    const encrypted = crypto.publicEncrypt(
        {
            key: publicKeyPem,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256',
        },
        Buffer.from(secret, 'hex')
    )
    return encrypted.toString('base64')
}

// ── One-time entity registration ─────────────────────────────────────────────

export async function registerEntity(secretHex: string): Promise<{ ciphertext: string }> {
    const publicKey = await getEntityPublicKey()
    const ciphertext = encryptEntitySecret(secretHex, publicKey)
    await circleRequest('POST', '/config/entity', { entitySecretCiphertext: ciphertext })
    return { ciphertext }
}

// ── Wallet Set ────────────────────────────────────────────────────────────────

export async function createWalletSet(name: string): Promise<{ walletSetId: string }> {
    const secret = entitySecret()
    const publicKey = await getEntityPublicKey()
    const ciphertext = encryptEntitySecret(secret, publicKey)

    const data = await circleRequest('POST', '/developer/walletSets', {
        idempotencyKey: crypto.randomUUID(),
        entitySecretCiphertext: ciphertext,
        name,
    }) as { data?: { walletSet?: { id?: string } } }

    const id = data?.data?.walletSet?.id
    if (!id) throw new Error('Circle returned no walletSetId')
    return { walletSetId: id }
}

// ── Create wallet ─────────────────────────────────────────────────────────────

export async function createWallet(walletSetId: string, name: string): Promise<{
    walletId: string
    address: string
}> {
    const secret = entitySecret()
    const publicKey = await getEntityPublicKey()
    const ciphertext = encryptEntitySecret(secret, publicKey)

    const data = await circleRequest('POST', '/developer/wallets', {
        idempotencyKey: crypto.randomUUID(),
        entitySecretCiphertext: ciphertext,
        walletSetId,
        blockchains: ['ARB'],  // Arbitrum One mainnet
        count: 1,
        metadata: [{ name, refId: name }],
    }) as { data?: { wallets?: Array<{ id?: string; address?: string }> } }

    const wallet = data?.data?.wallets?.[0]
    if (!wallet?.id || !wallet?.address) throw new Error('Circle returned no wallet data')
    return { walletId: wallet.id, address: wallet.address }
}

// ── Execute contract call via Circle wallet ───────────────────────────────────

export interface ContractCallParams {
    walletId: string
    contractAddress: string
    abiFunctionSignature: string   // e.g. "grantRole(bytes32,address)"
    abiParameters: unknown[]       // e.g. ["0x97667...", "0x07CA9DC1..."]
    feeLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
}

export interface CircleTxResult {
    transactionId: string
    txHash?: string
    state: string
}

export async function executeContractCall(params: ContractCallParams): Promise<CircleTxResult> {
    const secret = entitySecret()
    const publicKey = await getEntityPublicKey()
    const ciphertext = encryptEntitySecret(secret, publicKey)

    const data = await circleRequest('POST', '/developer/transactions/contractExecution', {
        idempotencyKey: crypto.randomUUID(),
        entitySecretCiphertext: ciphertext,
        walletId: params.walletId,
        contractAddress: params.contractAddress,
        abiFunctionSignature: params.abiFunctionSignature,
        abiParameters: params.abiParameters,
        feeLevel: params.feeLevel ?? 'HIGH',
        blockchain: 'ARB',
    }) as { data?: { transaction?: { id?: string; txHash?: string; state?: string } } }

    const tx = data?.data?.transaction
    if (!tx?.id) throw new Error('Circle returned no transaction ID')
    return {
        transactionId: tx.id,
        txHash: tx.txHash ?? undefined,
        state: tx.state ?? 'INITIATED',
    }
}

// ── Poll transaction until confirmed or failed ────────────────────────────────

export async function pollTransaction(
    transactionId: string,
    timeoutMs = 90_000
): Promise<CircleTxResult> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        const data = await circleRequest('GET', `/transactions/${transactionId}`) as {
            data?: { transaction?: { id?: string; txHash?: string; state?: string } }
        }
        const tx = data?.data?.transaction
        const state = tx?.state ?? 'UNKNOWN'
        if (state === 'CONFIRMED') return { transactionId, txHash: tx?.txHash, state }
        if (state === 'FAILED' || state === 'CANCELLED') throw new Error(`Circle tx ${transactionId} ended in state: ${state}`)
        await new Promise(r => setTimeout(r, 3000))
    }
    throw new Error(`Circle tx ${transactionId} timed out after ${timeoutMs}ms`)
}
