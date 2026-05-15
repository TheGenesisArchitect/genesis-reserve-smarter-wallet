/**
 * scripts/grant-operator-role.ts
 *
 * EMERGENCY ROTATION: Transfers DEFAULT_ADMIN_ROLE + OPERATOR_ROLE from the
 * compromised old operator to the new funded operator, then revokes both from
 * the compromised address.
 *
 * Required env vars in .env.local:
 *   OLD_OPERATOR_PRIVATE_KEY        — compromised wallet (current role holder)
 *   GENESIS_VAULT_OPERATOR_ADDRESS  — new wallet to receive roles
 *   NEXT_PUBLIC_GENESIS_VAULT_ADDRESS
 *   ARBITRUM_RPC_URL
 *
 * Run from genesis-privy-integration/genesis-privy/gr/gr:
 *   npx ts-node scripts/grant-operator-role.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

import { ethers } from 'ethers';

const ACCESS_CONTROL_ABI = [
    'function hasRole(bytes32 role, address account) view returns (bool)',
    'function grantRole(bytes32 role, address account)',
    'function revokeRole(bytes32 role, address account)',
    'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
];

async function sendAndWait(label: string, tx: ethers.ContractTransaction) {
    console.log(`\n[${label}] Tx submitted: ${tx.hash}`);
    const receipt = await tx.wait(1);
    console.log(`[${label}] ✓ Confirmed in block ${receipt.blockNumber}  gas: ${receipt.gasUsed}`);
    return receipt;
}

async function main() {
    const rpcUrl = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
    const oldKey = process.env.OLD_OPERATOR_PRIVATE_KEY;
    const newAddr = process.env.GENESIS_VAULT_OPERATOR_ADDRESS;
    const vaultAddress = process.env.NEXT_PUBLIC_GENESIS_VAULT_ADDRESS;

    if (!oldKey) throw new Error('OLD_OPERATOR_PRIVATE_KEY not set in .env.local');
    if (!newAddr) throw new Error('GENESIS_VAULT_OPERATOR_ADDRESS not set in .env.local');
    if (!vaultAddress) throw new Error('NEXT_PUBLIC_GENESIS_VAULT_ADDRESS not set in .env.local');

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl, 42161);
    const oldWallet = new ethers.Wallet(oldKey, provider);
    const vault = new ethers.Contract(vaultAddress, ACCESS_CONTROL_ABI, oldWallet);

    const DEFAULT_ADMIN_ROLE: string = await vault.DEFAULT_ADMIN_ROLE();
    const OPERATOR_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('OPERATOR_ROLE'));

    console.log('Vault              :', vaultAddress);
    console.log('Compromised wallet :', oldWallet.address);
    console.log('New operator       :', newAddr);
    console.log('DEFAULT_ADMIN_ROLE :', DEFAULT_ADMIN_ROLE);
    console.log('OPERATOR_ROLE      :', OPERATOR_ROLE);

    // Verify the old wallet actually has admin
    const hasAdmin = await vault.hasRole(DEFAULT_ADMIN_ROLE, oldWallet.address);
    if (!hasAdmin) throw new Error(`${oldWallet.address} does not have DEFAULT_ADMIN_ROLE — check OLD_OPERATOR_PRIVATE_KEY`);

    // ── Step 1: Grant DEFAULT_ADMIN_ROLE to new operator ──────────────────────
    const newHasAdmin = await vault.hasRole(DEFAULT_ADMIN_ROLE, newAddr);
    if (!newHasAdmin) {
        await sendAndWait('Grant DEFAULT_ADMIN_ROLE → new',
            await vault.grantRole(DEFAULT_ADMIN_ROLE, newAddr, { gasLimit: 100_000 }));
    } else {
        console.log('\n[Skip] New operator already has DEFAULT_ADMIN_ROLE');
    }

    // ── Step 2: Grant OPERATOR_ROLE to new operator ───────────────────────────
    const newHasOp = await vault.hasRole(OPERATOR_ROLE, newAddr);
    if (!newHasOp) {
        await sendAndWait('Grant OPERATOR_ROLE → new',
            await vault.grantRole(OPERATOR_ROLE, newAddr, { gasLimit: 100_000 }));
    } else {
        console.log('\n[Skip] New operator already has OPERATOR_ROLE');
    }

    // ── Step 3: Revoke OPERATOR_ROLE from compromised wallet ─────────────────
    const oldHasOp = await vault.hasRole(OPERATOR_ROLE, oldWallet.address);
    if (oldHasOp) {
        await sendAndWait('Revoke OPERATOR_ROLE ← old',
            await vault.revokeRole(OPERATOR_ROLE, oldWallet.address, { gasLimit: 100_000 }));
    } else {
        console.log('\n[Skip] Old wallet no longer has OPERATOR_ROLE');
    }

    // ── Step 4: Revoke DEFAULT_ADMIN_ROLE from compromised wallet ─────────────
    // Must be done LAST — once revoked, old wallet can do nothing further
    const oldStillAdmin = await vault.hasRole(DEFAULT_ADMIN_ROLE, oldWallet.address);
    if (oldStillAdmin) {
        await sendAndWait('Revoke DEFAULT_ADMIN_ROLE ← old',
            await vault.revokeRole(DEFAULT_ADMIN_ROLE, oldWallet.address, { gasLimit: 100_000 }));
    } else {
        console.log('\n[Skip] Old wallet no longer has DEFAULT_ADMIN_ROLE');
    }

    // ── Final verification ────────────────────────────────────────────────────
    console.log('\n── Final state ──────────────────────────────────────────');
    console.log('New operator | admin:', await vault.hasRole(DEFAULT_ADMIN_ROLE, newAddr),
        '| operator:', await vault.hasRole(OPERATOR_ROLE, newAddr));
    console.log('Old wallet   | admin:', await vault.hasRole(DEFAULT_ADMIN_ROLE, oldWallet.address),
        '| operator:', await vault.hasRole(OPERATOR_ROLE, oldWallet.address));
    console.log('\n✓ Role rotation complete. Remove OLD_OPERATOR_PRIVATE_KEY from .env.local now.');
}

main().catch((err) => {
    console.error('\n✗ Error:', err.message || err);
    process.exit(1);
});
