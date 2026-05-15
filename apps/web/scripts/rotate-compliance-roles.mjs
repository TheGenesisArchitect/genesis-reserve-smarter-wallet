/**
 * rotate-compliance-roles.mjs
 *
 * One-step key-rotation automation:
 * 1) Top up NEW operational wallets to minimum gas balances
 * 2) Sweep funds from OLD wallets into NEW wallets
 * 3) Rotate on-chain ComplianceRegistry roles
 *
 * Usage:
 *   Dry run (default): node scripts/rotate-compliance-roles.mjs
 *   Execute txs:       node scripts/rotate-compliance-roles.mjs --execute
 *
 * Required env in .env.local:
 *   NEXT_PUBLIC_COMPLIANCE_REGISTRY_ADDRESS
 *   ARBITRUM_RPC_URL (optional; defaults to public Arb RPC)
 *   COMPLIANCE_WRITER_ADDRESS
 *   COMPLIANCE_ADMIN_ADDRESS
 *   GENESIS_RELAYER_ADDRESS
 *
 * For automated top-up:
 *   ROTATION_FUNDING_PRIVATE_KEY
 *
 * For automated sweep:
 *   ROTATION_OLD_COMPLIANCE_WRITER_PRIVATE_KEY (optional)
 *   ROTATION_OLD_COMPLIANCE_ADMIN_PRIVATE_KEY (optional)
 *   ROTATION_OLD_RELAYER_PRIVATE_KEY (optional)
 *
 * For role rotation:
 *   ROTATION_ROLE_ADMIN_PRIVATE_KEY (must have DEFAULT_ADMIN_ROLE)
 *   ROTATION_OLD_COMPLIANCE_WRITER_ADDRESS
 *   ROTATION_OLD_COMPLIANCE_ADMIN_ADDRESS
 */

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const req = createRequire(import.meta.url)
const ethersLib = req('ethers')
const ethers = ethersLib

const ONE_GWEI = 1_000_000_000n
const DEFAULT_TARGET_BALANCE_WEI = 10_000_000_000_000_000n // 0.01 ETH
const DEFAULT_SWEEP_RESERVE_WEI = 300_000_000_000_000n // 0.0003 ETH

const JsonRpcProvider = ethers.providers.JsonRpcProvider
const parseEther = ethers.utils.parseEther
const formatEther = ethers.utils.formatEther
const keccak256 = ethers.utils.keccak256
const toUtf8Bytes = ethers.utils.toUtf8Bytes
const ZERO_HASH = ethers.constants.HashZero

function weiToBigInt(value) {
  return typeof value === 'bigint' ? value : BigInt(value.toString())
}

function toBigNumber(value) {
  return ethers.BigNumber.from(value.toString())
}

function loadEnvLocal() {
  const envPath = path.resolve(__dirname, '../.env.local')
  const envLines = readFileSync(envPath, 'utf8').split('\n')
  const env = {}
  for (const line of envLines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return env
}

function parseWei(raw, fallbackWei) {
  if (!raw) return fallbackWei
  try {
    if (raw.startsWith('0x')) return BigInt(raw)
    if (raw.includes('.')) return weiToBigInt(parseEther(raw))
    return BigInt(raw)
  } catch {
    return fallbackWei
  }
}

function toEth(wei) {
  return Number(formatEther(toBigNumber(wei))).toFixed(6)
}

async function sendEth({ signer, to, value, reason, execute }) {
  if (value <= 0n) return
  if (!execute) {
    console.log(`  [dry-run] ${reason}: ${toEth(value)} ETH -> ${to}`)
    return
  }

  const tx = await signer.sendTransaction({ to, value: toBigNumber(value) })
  console.log(`  ${reason}: tx=${tx.hash}`)
  await tx.wait()
  console.log('  ✓ confirmed')
}

async function topUpTargets({ provider, fundingPk, targets, execute }) {
  if (!fundingPk) {
    console.log('\n[skip] ROTATION_FUNDING_PRIVATE_KEY not set; top-up step skipped')
    return
  }

  const funder = new ethers.Wallet(fundingPk, provider)
  const funderBal = weiToBigInt(await provider.getBalance(funder.address))
  console.log(`\n[top-up] Funder ${funder.address} balance=${toEth(funderBal)} ETH`)

  for (const target of targets) {
    const current = weiToBigInt(await provider.getBalance(target.address))
    const deficit = target.minWei > current ? target.minWei - current : 0n
    if (deficit === 0n) {
      console.log(`  ${target.label}: already funded (${toEth(current)} ETH)`)
      continue
    }

    await sendEth({
      signer: funder,
      to: target.address,
      value: deficit,
      reason: `top-up ${target.label}`,
      execute,
    })
  }
}

async function sweepOldWallet({ provider, oldPk, newAddress, reserveWei, execute, label }) {
  if (!oldPk) {
    console.log(`\n[skip] ${label} old private key not set; sweep skipped`)
    return
  }

  const oldWallet = new ethers.Wallet(oldPk, provider)
  const oldBal = weiToBigInt(await provider.getBalance(oldWallet.address))
  console.log(`\n[sweep] ${label}: old=${oldWallet.address} balance=${toEth(oldBal)} ETH`)

  if (oldBal <= reserveWei) {
    console.log(`  ${label}: balance below reserve (${toEth(reserveWei)} ETH), nothing to sweep`)
    return
  }

  const latest = await provider.getBlock('latest')
  const baseFee = latest?.baseFeePerGas ? weiToBigInt(latest.baseFeePerGas) : ONE_GWEI
  const priorityFee = 100_000_000n // 0.1 gwei
  const maxFeePerGas = (baseFee * 2n) + priorityFee
  const transferGasLimit = 100_000n
  const gasCost = transferGasLimit * maxFeePerGas
  const transferable = oldBal - reserveWei - gasCost

  if (transferable <= 0n) {
    console.log(`  ${label}: insufficient balance after reserve+gas, nothing to sweep`)
    return
  }

  if (!execute) {
    console.log(`  [dry-run] sweep ${label}: ${toEth(transferable)} ETH -> ${newAddress}`)
    return
  }

  const tx = await oldWallet.sendTransaction({
    type: 2,
    to: newAddress,
    value: toBigNumber(transferable),
    gasLimit: Number(transferGasLimit),
    maxPriorityFeePerGas: toBigNumber(priorityFee),
    maxFeePerGas: toBigNumber(maxFeePerGas),
  })
  console.log(`  sweep ${label}: tx=${tx.hash}`)
  await tx.wait()
  console.log('  ✓ confirmed')
}

async function rotateRoles({ provider, env, execute }) {
  const roleAdminPk = env.ROTATION_ROLE_ADMIN_PRIVATE_KEY
  const oldWriter = env.ROTATION_OLD_COMPLIANCE_WRITER_ADDRESS
  const oldAdmin = env.ROTATION_OLD_COMPLIANCE_ADMIN_ADDRESS
  const newWriter = env.COMPLIANCE_WRITER_ADDRESS
  const newAdmin = env.COMPLIANCE_ADMIN_ADDRESS
  const registryAddress = env.NEXT_PUBLIC_COMPLIANCE_REGISTRY_ADDRESS

  if (!roleAdminPk || !oldWriter || !oldAdmin) {
    console.log('\n[skip] Role rotation skipped. Set ROTATION_ROLE_ADMIN_PRIVATE_KEY + ROTATION_OLD_*_ADDRESS env vars to enable.')
    return
  }

  const abi = [
    'function grantRole(bytes32 role, address account) external',
    'function revokeRole(bytes32 role, address account) external',
    'function hasRole(bytes32 role, address account) view returns (bool)',
  ]

  const signer = new ethers.Wallet(roleAdminPk, provider)
  const registry = new ethers.Contract(registryAddress, abi, signer)
  const COMPLIANCE_WRITER = keccak256(toUtf8Bytes('COMPLIANCE_WRITER'))
  const COMPLIANCE_WRITER_ROLE = keccak256(toUtf8Bytes('COMPLIANCE_WRITER_ROLE'))
  const DEFAULT_ADMIN_ROLE = ZERO_HASH

  console.log(`\n[roles] Registry ${registryAddress}`)
  console.log(`[roles] Signer ${signer.address}`)

  async function hasRole(role, account) {
    return registry.hasRole(role, account)
  }

  async function grantIfMissing(role, account, label) {
    if (!account) return
    if (await hasRole(role, account)) {
      console.log(`  ${label}: already granted`)
      return
    }
    if (!execute) {
      console.log(`  [dry-run] grant ${label} -> ${account}`)
      return
    }
    const tx = await registry.grantRole(role, account)
    console.log(`  grant ${label}: tx=${tx.hash}`)
    await tx.wait()
    console.log('  ✓ confirmed')
  }

  async function revokeIfPresent(role, account, label) {
    if (!account) return
    if (!(await hasRole(role, account))) {
      console.log(`  ${label}: already revoked`)
      return
    }
    if (!execute) {
      console.log(`  [dry-run] revoke ${label} <- ${account}`)
      return
    }
    const tx = await registry.revokeRole(role, account)
    console.log(`  revoke ${label}: tx=${tx.hash}`)
    await tx.wait()
    console.log('  ✓ confirmed')
  }

  await grantIfMissing(COMPLIANCE_WRITER, newWriter, 'COMPLIANCE_WRITER(new writer)')
  await grantIfMissing(COMPLIANCE_WRITER_ROLE, newWriter, 'COMPLIANCE_WRITER_ROLE(new writer)')
  await grantIfMissing(DEFAULT_ADMIN_ROLE, newAdmin, 'DEFAULT_ADMIN_ROLE(new admin)')

  await revokeIfPresent(COMPLIANCE_WRITER, oldWriter, 'COMPLIANCE_WRITER(old writer)')
  await revokeIfPresent(COMPLIANCE_WRITER_ROLE, oldWriter, 'COMPLIANCE_WRITER_ROLE(old writer)')
  // Revoke old admin last to avoid losing privileges mid-rotation.
  await revokeIfPresent(DEFAULT_ADMIN_ROLE, oldAdmin, 'DEFAULT_ADMIN_ROLE(old admin)')
}

async function main() {
  const env = loadEnvLocal()
  const execute = process.argv.includes('--execute')

  const rpcUrl = env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'
  const provider = new JsonRpcProvider(rpcUrl)

  const writerAddress = env.COMPLIANCE_WRITER_ADDRESS
  const adminAddress = env.COMPLIANCE_ADMIN_ADDRESS
  const relayerAddress = env.GENESIS_RELAYER_ADDRESS

  if (!writerAddress || !adminAddress || !relayerAddress) {
    throw new Error('Missing new target addresses in .env.local')
  }

  const targetDefault = parseWei(env.ROTATION_TARGET_BALANCE_WEI, DEFAULT_TARGET_BALANCE_WEI)
  const writerTarget = parseWei(env.ROTATION_TARGET_BALANCE_WRITER_WEI, targetDefault)
  const adminTarget = parseWei(env.ROTATION_TARGET_BALANCE_ADMIN_WEI, targetDefault)
  const relayerTarget = parseWei(env.ROTATION_TARGET_BALANCE_RELAYER_WEI, targetDefault)
  const sweepReserve = parseWei(env.ROTATION_SWEEP_RESERVE_WEI, DEFAULT_SWEEP_RESERVE_WEI)

  console.log(`\nMode: ${execute ? 'EXECUTE' : 'DRY RUN'}`)
  console.log(`RPC: ${rpcUrl}`)
  console.log(`Network: ${(await provider.getNetwork()).name}`)

  const targets = [
    { label: 'new writer', address: writerAddress, minWei: writerTarget },
    { label: 'new admin', address: adminAddress, minWei: adminTarget },
    { label: 'new relayer', address: relayerAddress, minWei: relayerTarget },
  ]

  await topUpTargets({
    provider,
    fundingPk: env.ROTATION_FUNDING_PRIVATE_KEY,
    targets,
    execute,
  })

  await sweepOldWallet({
    provider,
    oldPk: env.ROTATION_OLD_COMPLIANCE_WRITER_PRIVATE_KEY,
    newAddress: writerAddress,
    reserveWei: sweepReserve,
    execute,
    label: 'writer',
  })

  await sweepOldWallet({
    provider,
    oldPk: env.ROTATION_OLD_COMPLIANCE_ADMIN_PRIVATE_KEY,
    newAddress: adminAddress,
    reserveWei: sweepReserve,
    execute,
    label: 'admin',
  })

  await sweepOldWallet({
    provider,
    oldPk: env.ROTATION_OLD_RELAYER_PRIVATE_KEY,
    newAddress: relayerAddress,
    reserveWei: sweepReserve,
    execute,
    label: 'relayer',
  })

  await rotateRoles({ provider, env, execute })

  console.log('\nDone.')
  if (!execute) {
    console.log('Dry run completed. Re-run with --execute to broadcast transactions.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
