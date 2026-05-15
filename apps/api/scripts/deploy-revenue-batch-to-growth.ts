/**
 * scripts/deploy-revenue-batch-to-growth.ts
 *
 * Batch-deploys treasury revenue USDC into GenesisVault in Growth mode.
 *
 * Required env vars (.env.local or process env):
 *   ARBITRUM_RPC_URL
 *   NEXT_PUBLIC_GENESIS_VAULT_ADDRESS
 *   NEXT_PUBLIC_USDC_ADDRESS
 *   GENESIS_VAULT_OPERATOR_PRIVATE_KEY
 *   REVENUE_WALLET_PRIVATE_KEY
 *
 * Optional:
 *   REVENUE_BATCH_MIN_USDC   default: 250
 *   REVENUE_BATCH_MAX_USDC   default: 5000
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') })

import { ethers } from 'ethers'

const USDC_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address,address) view returns (uint256)',
    'function approve(address,uint256) returns (bool)',
    'function decimals() view returns (uint8)',
] as const

const VAULT_ABI = [
    'function feeRecipient() view returns (address)',
    'function partnerFeeRecipient() view returns (address)',
    'function policies(address) view returns (uint8 mode,uint128 liquidBufferBps,uint128 maxSingleTxBps,uint64 kycLevel,uint64 riskTier,bool travelRuleRequired,bool active)',
    'function activateAccount(address account,uint8 mode,uint64 kycLevel,uint64 riskTier,bool travelRuleRequired)',
    'function updateMode(address account,uint8 mode)',
    'function deposit(uint256 assets,address receiver) returns (uint256 shares)',
] as const

const GROWTH_MODE = 2

function must(name: string): string {
    const val = process.env[name]
    if (!val) throw new Error(`${name} is not set`)
    return val
}

async function main() {
    const rpcUrl = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'
    const vaultAddress = must('NEXT_PUBLIC_GENESIS_VAULT_ADDRESS')
    const usdcAddress = must('NEXT_PUBLIC_USDC_ADDRESS')
    const operatorPk = must('GENESIS_VAULT_OPERATOR_PRIVATE_KEY')
    const revenuePk = must('REVENUE_WALLET_PRIVATE_KEY')

    const minBatch = Number(process.env.REVENUE_BATCH_MIN_USDC || '250')
    const maxBatch = Number(process.env.REVENUE_BATCH_MAX_USDC || '5000')

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl, 42161)
    const operator = new ethers.Wallet(operatorPk, provider)
    const revenueWallet = new ethers.Wallet(revenuePk, provider)

    const vaultRead = new ethers.Contract(vaultAddress, VAULT_ABI, provider)
    const vaultOp = new ethers.Contract(vaultAddress, VAULT_ABI, operator)
    const usdcRead = new ethers.Contract(usdcAddress, USDC_ABI, provider)
    const usdcRevenue = new ethers.Contract(usdcAddress, USDC_ABI, revenueWallet)

    const [feeRecipient, partnerFeeRecipient, decimals] = await Promise.all([
        vaultRead.feeRecipient(),
        vaultRead.partnerFeeRecipient(),
        usdcRead.decimals(),
    ])

    if (decimals !== 6) {
        throw new Error(`USDC decimals mismatch: expected 6, got ${decimals}`)
    }

    console.log('Vault                  :', vaultAddress)
    console.log('USDC                   :', usdcAddress)
    console.log('Operator               :', operator.address)
    console.log('Revenue wallet         :', revenueWallet.address)
    console.log('feeRecipient           :', feeRecipient)
    console.log('partnerFeeRecipient    :', partnerFeeRecipient)

    if (
        feeRecipient.toLowerCase() !== revenueWallet.address.toLowerCase() ||
        partnerFeeRecipient.toLowerCase() !== revenueWallet.address.toLowerCase()
    ) {
        console.log('\nWARNING: revenue wallet does not match on-chain fee recipient(s).')
        console.log('Depositing from this wallet is still possible, but fee intake may be going elsewhere.')
    }

    const balance = await usdcRead.balanceOf(revenueWallet.address)
    const minAtomic = ethers.utils.parseUnits(minBatch.toString(), 6)
    const maxAtomic = ethers.utils.parseUnits(maxBatch.toString(), 6)

    console.log('Revenue USDC balance    :', ethers.utils.formatUnits(balance, 6))

    if (balance.lt(minAtomic)) {
        console.log(`\nSkip: balance below min batch (${minBatch} USDC).`)
        return
    }

    const batchAmount = balance.gt(maxAtomic) ? maxAtomic : balance
    console.log('Batch amount (USDC)     :', ethers.utils.formatUnits(batchAmount, 6))

    // Ensure account policy exists and is Growth mode.
    let policy: {
        mode: number
        kycLevel: ethers.BigNumber
        riskTier: ethers.BigNumber
        travelRuleRequired: boolean
        active: boolean
    }

    try {
        const raw = await vaultRead.policies(revenueWallet.address)
        policy = {
            mode: Number(raw.mode),
            kycLevel: raw.kycLevel,
            riskTier: raw.riskTier,
            travelRuleRequired: raw.travelRuleRequired,
            active: raw.active,
        }
    } catch {
        policy = {
            mode: 0,
            kycLevel: ethers.BigNumber.from(1),
            riskTier: ethers.BigNumber.from(1),
            travelRuleRequired: false,
            active: false,
        }
    }

    if (!policy.active) {
        console.log('\nActivating revenue wallet account policy...')
        const tx = await vaultOp.activateAccount(
            revenueWallet.address,
            GROWTH_MODE,
            policy.kycLevel.toNumber() || 1,
            policy.riskTier.toNumber() || 1,
            policy.travelRuleRequired,
            { gasLimit: 220_000 }
        )
        await tx.wait(1)
        console.log('Activated account policy tx:', tx.hash)
    } else if (policy.mode !== GROWTH_MODE) {
        console.log('\nUpdating treasury mode to Growth...')
        const tx = await vaultOp.updateMode(revenueWallet.address, GROWTH_MODE, { gasLimit: 120_000 })
        await tx.wait(1)
        console.log('Updated mode tx:', tx.hash)
    } else {
        console.log('\nPolicy already active in Growth mode.')
    }

    // Approve if needed.
    const allowance = await usdcRead.allowance(revenueWallet.address, vaultAddress)
    if (allowance.lt(batchAmount)) {
        console.log('\nApproving USDC spend to vault...')
        const approveTx = await usdcRevenue.approve(vaultAddress, batchAmount)
        await approveTx.wait(1)
        console.log('Approve tx:', approveTx.hash)
    }

    // Deposit to vault.
    console.log('\nDepositing revenue batch to vault...')
    const vaultFromRevenue = new ethers.Contract(vaultAddress, VAULT_ABI, revenueWallet)
    const depositTx = await vaultFromRevenue.deposit(batchAmount, revenueWallet.address, { gasLimit: 350_000 })
    const receipt = await depositTx.wait(1)

    console.log('Deposit tx             :', depositTx.hash)
    console.log('Block                  :', receipt.blockNumber)
    console.log('Gas used               :', receipt.gasUsed.toString())
    console.log('\nSUCCESS: Revenue batch deployed to Growth strategy path via GenesisVault.')
}

main().catch((err) => {
    console.error('\nERROR:', err.message || err)
    process.exit(1)
})
