/**
 * scripts/emergency-drain.ts
 * Uses the GUARDIAN + DEFAULT_ADMIN flow to recover all liquid USDC from the vault:
 *   1. emergencyPause (GUARDIAN_ROLE)
 *   2. emergencyDrain(wallet) (DEFAULT_ADMIN_ROLE)
 *   3. unpause (GUARDIAN_ROLE)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { ethers } from 'ethers';

const VAULT_ABI = [
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function liquidBuffer() view returns (uint256)',
  'function reservedForPayouts() view returns (uint256)',
  'function deployedAssets() view returns (uint256)',
  'function paused() view returns (bool)',
  'function emergencyPause(string reason)',
  'function emergencyDrain(address safe)',
  'function unpause()',
  'function totalAssets() view returns (uint256)',
];
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
];

async function main() {
  const rpcUrl = process.env.RPC_URL || process.env.ALCHEMY_RPC_URL || `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl, 421614);
  const privKey = process.env.OPERATOR_PRIVATE_KEY_TESTNET || process.env.OPERATOR_PRIVATE_KEY!;
  const wallet = new ethers.Wallet(privKey, provider);

  const vaultAddr = process.env.GENESIS_VAULT_ADDRESS!;
  const usdcAddr  = process.env.USDC_TESTNET_ADDRESS || '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d';
  const vault = new ethers.Contract(vaultAddr, VAULT_ABI, wallet);
  const usdc  = new ethers.Contract(usdcAddr,  ERC20_ABI, provider);

  const DEFAULT_ADMIN = ethers.constants.HashZero;
  const GUARDIAN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('GUARDIAN_ROLE'));

  const [isAdmin, isGuardian, liquidBuf, reserved, deployed, paused, walletBal] =
    await Promise.all([
      vault.hasRole(DEFAULT_ADMIN, wallet.address),
      vault.hasRole(GUARDIAN_ROLE, wallet.address),
      vault.liquidBuffer(),
      vault.reservedForPayouts(),
      vault.deployedAssets(),
      vault.paused(),
      usdc.balanceOf(wallet.address),
    ]);

  console.log(`Wallet:            ${wallet.address}`);
  console.log(`Has DEFAULT_ADMIN: ${isAdmin}`);
  console.log(`Has GUARDIAN_ROLE: ${isGuardian}`);
  console.log(`Vault paused:      ${paused}`);
  console.log(`liquidBuffer:      ${ethers.utils.formatUnits(liquidBuf, 6)} USDC`);
  console.log(`reservedForPayouts:${ethers.utils.formatUnits(reserved, 6)} USDC`);
  console.log(`deployedAssets:    ${ethers.utils.formatUnits(deployed, 6)} USDC`);
  console.log(`Wallet USDC before:${ethers.utils.formatUnits(walletBal, 6)} USDC`);

  if (!isAdmin || !isGuardian) {
    console.error('\nWallet lacks required roles — cannot drain. Aborting.');
    process.exit(1);
  }

  if (liquidBuf.isZero() && reserved.isZero()) {
    console.log('\nVault liquid buffer is 0 — nothing to drain.');
    process.exit(0);
  }

  // 1. Pause
  if (!paused) {
    console.log('\nPausing vault...');
    const tx1 = await vault.emergencyPause('e2e test recovery drain');
    await tx1.wait(1);
    console.log('Vault paused.');
  }

  // 2. Drain
  console.log(`\nDraining liquidBuffer (${ethers.utils.formatUnits(liquidBuf, 6)} USDC) to wallet...`);
  const tx2 = await vault.emergencyDrain(wallet.address);
  console.log(`TX: ${tx2.hash} — waiting...`);
  const receipt = await tx2.wait(1);
  console.log(`Confirmed block ${receipt.blockNumber}`);

  // 3. Unpause
  console.log('\nUnpausing vault...');
  const tx3 = await vault.unpause();
  await tx3.wait(1);
  console.log('Vault unpaused.');

  const [balAfter, lbAfter] = await Promise.all([
    usdc.balanceOf(wallet.address),
    vault.liquidBuffer(),
  ]);

  console.log(`\n── Final state ─────────────────────────────`);
  console.log(`Wallet USDC after:  ${ethers.utils.formatUnits(balAfter, 6)} USDC`);
  console.log(`Vault liquidBuffer: ${ethers.utils.formatUnits(lbAfter, 6)} USDC`);
}

main().catch(err => {
  console.error(err.reason || err.message || err);
  process.exit(1);
});
