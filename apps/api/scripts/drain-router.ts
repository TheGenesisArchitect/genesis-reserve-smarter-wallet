/**
 * scripts/drain-router.ts
 * Emergency drain from StrategyRouter: pause → withdrawAll → unpause.
 * Sends all deployed USDC back to the operator wallet.
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { ethers } from 'ethers';

const ROUTER_ABI = [
  'function hasRole(bytes32,address) view returns (bool)',
  'function paused() view returns (bool)',
  'function totalDeployed() view returns (uint256)',
  'function emergencyPause()',
  'function unpause()',
  'function emergencyWithdrawAll(address safe)',
];
const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];

async function main() {
  const rpcUrl = process.env.RPC_URL || process.env.ALCHEMY_RPC_URL
    || `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl, 421614);
  const privKey = process.env.OPERATOR_PRIVATE_KEY_TESTNET || process.env.OPERATOR_PRIVATE_KEY!;
  const wallet = new ethers.Wallet(privKey, provider);

  const routerAddr = process.env.STRATEGY_ROUTER_ADDRESS!;
  const usdcAddr   = process.env.USDC_TESTNET_ADDRESS || '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d';
  const router = new ethers.Contract(routerAddr, ROUTER_ABI, wallet);
  const usdc   = new ethers.Contract(usdcAddr, ERC20_ABI, provider);

  const DEFAULT_ADMIN = ethers.constants.HashZero;
  const GUARDIAN = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('GUARDIAN_ROLE'));

  const [isAdmin, isGuardian, paused, deployed, routerBal, walletBal] = await Promise.all([
    router.hasRole(DEFAULT_ADMIN, wallet.address),
    router.hasRole(GUARDIAN, wallet.address),
    router.paused(),
    router.totalDeployed(),
    usdc.balanceOf(routerAddr),
    usdc.balanceOf(wallet.address),
  ]);

  console.log(`Wallet:             ${wallet.address}`);
  console.log(`Router:             ${routerAddr}`);
  console.log(`Has DEFAULT_ADMIN:  ${isAdmin}`);
  console.log(`Has GUARDIAN_ROLE:  ${isGuardian}`);
  console.log(`Router paused:      ${paused}`);
  console.log(`Router totalDeployed: ${ethers.utils.formatUnits(deployed, 6)} USDC`);
  console.log(`Router USDC balance: ${ethers.utils.formatUnits(routerBal, 6)} USDC`);
  console.log(`Wallet USDC before: ${ethers.utils.formatUnits(walletBal, 6)} USDC`);

  if (!isAdmin || !isGuardian) {
    console.error('\nWallet lacks required roles on StrategyRouter — cannot drain.');
    process.exit(1);
  }

  if (deployed.isZero() && routerBal.isZero()) {
    console.log('\nNothing deployed in router — nothing to drain.');
    process.exit(0);
  }

  // 1. Pause router
  if (!paused) {
    console.log('\nPausing StrategyRouter...');
    const tx1 = await router.emergencyPause();
    await tx1.wait(1);
    console.log('StrategyRouter paused.');
  }

  // 2. Drain all strategies → wallet
  console.log(`\nCalling emergencyWithdrawAll → ${wallet.address}...`);
  const tx2 = await router.emergencyWithdrawAll(wallet.address);
  console.log(`TX: ${tx2.hash} — waiting...`);
  const receipt = await tx2.wait(1);
  console.log(`Confirmed block ${receipt.blockNumber}`);

  // 3. Unpause
  console.log('\nUnpausing StrategyRouter...');
  const tx3 = await router.unpause();
  await tx3.wait(1);
  console.log('StrategyRouter unpaused.');

  const [balAfter, deployedAfter] = await Promise.all([
    usdc.balanceOf(wallet.address),
    router.totalDeployed(),
  ]);

  console.log(`\n── Final state ─────────────────────────────`);
  console.log(`Wallet USDC after:       ${ethers.utils.formatUnits(balAfter, 6)} USDC`);
  console.log(`Router totalDeployed:    ${ethers.utils.formatUnits(deployedAfter, 6)} USDC`);
}

main().catch(err => {
  console.error(err.reason || err.message || err);
  process.exit(1);
});
