/**
 * scripts/withdraw-vault.ts
 * Withdraws all available USDC from GenesisVault back to the operator wallet.
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { ethers } from 'ethers';

const VAULT_ABI = [
  'function maxWithdraw(address owner) view returns (uint256)',
  'function maxRedeem(address owner) view returns (uint256)',
  'function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)',
];
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

async function main() {
  const rpcUrl = process.env.RPC_URL || process.env.ALCHEMY_RPC_URL
    || `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl, 421614);
  const privKey = process.env.OPERATOR_PRIVATE_KEY_TESTNET || process.env.OPERATOR_PRIVATE_KEY!;
  const wallet = new ethers.Wallet(privKey, provider);

  const usdcAddr = process.env.USDC_TESTNET_ADDRESS || '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d';
  const vaultAddr = process.env.GENESIS_VAULT_ADDRESS!;

  const vault = new ethers.Contract(vaultAddr, VAULT_ABI, wallet);
  const usdc  = new ethers.Contract(usdcAddr,  ERC20_ABI, provider);

  const [dec, sym] = await Promise.all([usdc.decimals(), usdc.symbol()]);

  const balBefore = await usdc.balanceOf(wallet.address);
  const maxWithdraw = await vault.maxWithdraw(wallet.address);

  console.log(`Wallet:        ${wallet.address}`);
  console.log(`Vault:         ${vaultAddr}`);
  console.log(`Wallet before: ${ethers.utils.formatUnits(balBefore, dec)} ${sym}`);
  console.log(`Vault maxWithdraw: ${ethers.utils.formatUnits(maxWithdraw, dec)} ${sym}`);

  if (maxWithdraw.isZero()) {
    console.log('\nNothing to withdraw — vault balance is 0.');
    return;
  }

  console.log(`\nWithdrawing ${ethers.utils.formatUnits(maxWithdraw, dec)} ${sym}...`);
  const tx = await vault.withdraw(maxWithdraw, wallet.address, wallet.address);
  console.log(`TX sent: ${tx.hash}`);
  const receipt = await tx.wait(1);
  console.log(`Confirmed in block ${receipt.blockNumber}`);

  const [balAfter, leftover] = await Promise.all([
    usdc.balanceOf(wallet.address),
    vault.maxWithdraw(wallet.address),
  ]);

  console.log(`\n── Final state ──────────────────────────────`);
  console.log(`Wallet USDC:    ${ethers.utils.formatUnits(balAfter, dec)} ${sym}`);
  console.log(`Vault remaining: ${ethers.utils.formatUnits(leftover, dec)} ${sym}`);
}

main().catch(err => {
  console.error(err.reason || err.message || err);
  process.exit(1);
});
