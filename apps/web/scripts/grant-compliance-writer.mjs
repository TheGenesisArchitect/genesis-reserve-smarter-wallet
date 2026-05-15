/**
 * grant-compliance-writer.mjs
 *
 * Grants COMPLIANCE_WRITER role on ComplianceRegistry to a target signer.
 *
 * Required env:
 *   COMPLIANCE_ADMIN_PRIVATE_KEY=0x...   (must have admin rights on AccessControl)
 *   COMPLIANCE_WRITER_ADDRESS=0x...       (target writer address)
 *
 * Optional env:
 *   ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
 */

import { config } from 'dotenv'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createPublicClient, createWalletClient, http, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrum } from 'viem/chains'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env.local') })

const COMPLIANCE_REGISTRY = '0x6D58678562387c400964737884E78f2f12e1c495'
const RPC_URL = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'

const adminKey = process.env.COMPLIANCE_ADMIN_PRIVATE_KEY
const target = process.env.COMPLIANCE_WRITER_ADDRESS

if (!adminKey) {
  console.error('Missing COMPLIANCE_ADMIN_PRIVATE_KEY in environment')
  process.exit(1)
}

if (!target || !isAddress(target)) {
  console.error('Missing or invalid COMPLIANCE_WRITER_ADDRESS in environment')
  process.exit(1)
}

const ABI = [
  {
    name: 'COMPLIANCE_WRITER',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
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
  {
    name: 'grantRole',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
  },
]

async function main() {
  const admin = privateKeyToAccount(adminKey)

  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http(RPC_URL),
  })

  const walletClient = createWalletClient({
    account: admin,
    chain: arbitrum,
    transport: http(RPC_URL),
  })

  console.log('────────────────────────────────────────────────────────────')
  console.log('  Genesis Reserve — Grant COMPLIANCE_WRITER')
  console.log('────────────────────────────────────────────────────────────')
  console.log('  Admin signer:', admin.address)
  console.log('  Target signer:', target)
  console.log('  Registry:', COMPLIANCE_REGISTRY)

  const writerRole = await publicClient.readContract({
    address: COMPLIANCE_REGISTRY,
    abi: ABI,
    functionName: 'COMPLIANCE_WRITER',
  })

  const alreadyHas = await publicClient.readContract({
    address: COMPLIANCE_REGISTRY,
    abi: ABI,
    functionName: 'hasRole',
    args: [writerRole, target],
  })

  if (alreadyHas) {
    console.log('✅ Target already has COMPLIANCE_WRITER role')
    return
  }

  console.log('Granting role...')
  const hash = await walletClient.writeContract({
    address: COMPLIANCE_REGISTRY,
    abi: ABI,
    functionName: 'grantRole',
    args: [writerRole, target],
  })

  console.log('Transaction:', hash)
  console.log(`Arbiscan: https://arbiscan.io/tx/${hash}`)

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') {
    console.error('Role grant transaction failed')
    process.exit(1)
  }

  const hasRoleNow = await publicClient.readContract({
    address: COMPLIANCE_REGISTRY,
    abi: ABI,
    functionName: 'hasRole',
    args: [writerRole, target],
  })

  if (!hasRoleNow) {
    console.error('Role grant did not persist; check admin permissions')
    process.exit(1)
  }

  console.log('✅ COMPLIANCE_WRITER role granted successfully')
}

main().catch((err) => {
  console.error('❌', err.shortMessage || err.message)
  process.exit(1)
})
