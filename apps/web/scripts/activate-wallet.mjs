/**
 * activate-wallet.mjs
 *
 * Calls ComplianceRegistry.activateAccount() to register a wallet address
 * with Basic KYC tier (level 1) on Arbitrum One.
 *
 * Requires the calling key to have COMPLIANCE_WRITER role on the contract.
 * The deployer address that originally deployed ComplianceRegistry holds this role.
 *
 * Usage:
 *   COMPLIANCE_WRITER_KEY=0x<privkey> node scripts/activate-wallet.mjs <walletAddress>
 *
 * Example:
 *   COMPLIANCE_WRITER_KEY=0xabc123... node scripts/activate-wallet.mjs 0xYourWalletAddress
 */

import { readFileSync } from 'fs'
import { createWalletClient, createPublicClient, http, parseAbi } from 'viem'
import { arbitrum } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env.local') })

// ── Config ────────────────────────────────────────────────────────────────────
const COMPLIANCE_REGISTRY = '0x6D58678562387c400964737884E78f2f12e1c495'
const RPC_URL = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'

const WRITER_KEY = process.env.COMPLIANCE_WRITER_PRIVATE_KEY || process.env.COMPLIANCE_WRITER_KEY
if (!WRITER_KEY) {
    console.error('❌  Set COMPLIANCE_WRITER_PRIVATE_KEY=0x<privkey> in .env.local')
    process.exit(1)
}

const targetAddress = process.argv[2]
if (!targetAddress || !/^0x[0-9a-fA-F]{40}$/.test(targetAddress)) {
    console.error('❌  Usage: COMPLIANCE_WRITER_KEY=0x... node scripts/activate-wallet.mjs <walletAddress>')
    process.exit(1)
}

// ── ABI ───────────────────────────────────────────────────────────────────────
const ABI = parseAbi([
    'function activateAccount(address account, uint8 kycLevel, uint8 riskTier, string jurisdiction, bool pepFlag, uint64 kycExpiry, bytes32 kycProviderRef, bytes32 amlProviderRef) external',
    'function records(address account) external view returns (uint8 kycLevel, uint8 riskTier, bytes32 sanctionStatus, bytes32 amlStatus, string jurisdiction, bool pepFlag, bool travelRuleRequired, bool active, uint64 kycExpiry, uint64 lastScreening, uint256 dailyVolumeUsed, uint256 dailyVolumeReset, bytes32 kycProviderRef, bytes32 amlProviderRef)',
    'function hasRole(bytes32 role, address account) external view returns (bool)',
    'function COMPLIANCE_WRITER() external view returns (bytes32)',
])

// ── Clients ───────────────────────────────────────────────────────────────────
const account = privateKeyToAccount(WRITER_KEY)
const publicClient = createPublicClient({ chain: arbitrum, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain: arbitrum, transport: http(RPC_URL) })

async function main() {
    console.log('────────────────────────────────────────────────────────────')
    console.log('  Genesis Reserve — ComplianceRegistry Wallet Activation')
    console.log('────────────────────────────────────────────────────────────')
    console.log(`  Writer key:  ${account.address}`)
    console.log(`  Target:      ${targetAddress}`)
    console.log(`  Registry:    ${COMPLIANCE_REGISTRY}`)
    console.log()

    // 1. Check COMPLIANCE_WRITER role
    const writerRole = await publicClient.readContract({
        address: COMPLIANCE_REGISTRY,
        abi: ABI,
        functionName: 'COMPLIANCE_WRITER',
    })

    const hasWriterRole = await publicClient.readContract({
        address: COMPLIANCE_REGISTRY,
        abi: ABI,
        functionName: 'hasRole',
        args: [writerRole, account.address],
    })

    if (!hasWriterRole) {
        console.error(`❌  ${account.address} does not have COMPLIANCE_WRITER role on ${COMPLIANCE_REGISTRY}`)
        console.error('   You need the deployer key (the address that deployed the contract).')
        console.error('   The deployer was granted COMPLIANCE_WRITER in the constructor.')
        process.exit(1)
    }
    console.log('  ✅ COMPLIANCE_WRITER role confirmed')

    // 2. Check existing record
    const existing = await publicClient.readContract({
        address: COMPLIANCE_REGISTRY,
        abi: ABI,
        functionName: 'records',
        args: [targetAddress],
    })

    if (existing.active) {
        console.log(`  ⚠️  Account already active — kycLevel=${existing.kycLevel}, jurisdiction=${existing.jurisdiction}`)
        console.log('  No action needed. Set NEXT_PUBLIC_KYC_DEV_BYPASS=false to use on-chain data.')
        return
    }

    // 3. Activate with Basic KYC (tier 1), jurisdiction US, 1-year expiry
    const ONE_YEAR_FROM_NOW = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60)
    const PROVIDER_REF = '0x4745454e45534953000000000000000000000000000000000000000000000000' // "GENESIS" padded to 32 bytes

    // jurisdictions['US'] must be configured on the contract first — check if it is
    // If not, pass 'US' anyway; the transaction will revert and you'll see the error.
    console.log('  Sending activateAccount() tx...')

    const hash = await walletClient.writeContract({
        address: COMPLIANCE_REGISTRY,
        abi: ABI,
        functionName: 'activateAccount',
        args: [
            targetAddress,
            1,              // kycLevel: BASIC
            1,              // riskTier: 1 (low)
            'US',           // jurisdiction
            false,          // pepFlag
            ONE_YEAR_FROM_NOW,
            PROVIDER_REF,   // kycProviderRef
            PROVIDER_REF,   // amlProviderRef
        ],
    })

    console.log(`  ✅ Transaction submitted: ${hash}`)
    console.log(`  🔍 https://arbiscan.io/tx/${hash}`)
    console.log()
    console.log('  Waiting for confirmation...')

    const receipt = await publicClient.waitForTransactionReceipt({ hash })

    if (receipt.status === 'success') {
        console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`)
        console.log()
        console.log('  ────────────────────────────────────────────────────────────')
        console.log('  Wallet is now KYC-active (Basic tier) on-chain.')
        console.log('  You can now set NEXT_PUBLIC_KYC_DEV_BYPASS=false in .env.local')
        console.log('  and the vault deposit flow will read live on-chain tier data.')
        console.log('  ────────────────────────────────────────────────────────────')
    } else {
        console.error('  ❌ Transaction reverted. Check Arbiscan for revert reason.')
        process.exit(1)
    }
}

main().catch(err => {
    console.error('❌', err.shortMessage || err.message)
    process.exit(1)
})
