import { ethers } from 'ethers';
import { pool, query } from '../src/config/db';
import { logger } from '../src/config/logger';

async function ensurePartner() {
    const apiKey = process.env.GENESIS_PARTNER_API_KEY || process.env.TEST_API_KEY || 'dev_smoke_key';
    const keyHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(apiKey));

    await query(
        `INSERT INTO partners (name, api_key_hash, integration_level, status)
     VALUES ('Genesis Dev Partner', $1, 2, 'ACTIVE')
     ON CONFLICT (api_key_hash) DO UPDATE
       SET status = 'ACTIVE', updated_at = NOW()`,
        [keyHash]
    );

    const partner = await query<{ partner_id: string }>(
        `SELECT partner_id FROM partners WHERE api_key_hash = $1 LIMIT 1`,
        [keyHash]
    );

    return partner.rows[0]?.partner_id;
}

async function ensureUserAndAccount() {
    const emailHash          = 'seed_admin_user_hash_v1';
    const SEED_PRIVY_USER_ID = 'did:privy:seed-admin-v1';
    const SEED_EOA_ADDRESS   = '0x1111111111111111111111111111111111111111';
    const SEED_SMART_ACCOUNT = '0x2222222222222222222222222222222222222222';
    const SEED_CHAIN_ID      = 42161; // Arbitrum One

    // 1. Upsert base user â€” now with auth_source
    await query(
        `INSERT INTO users (email_hash, country, risk_tier, status, auth_source)
         VALUES ($1, 'US', 1, 'ACTIVE', 'PRIVY')
         ON CONFLICT (email_hash) DO UPDATE
           SET status = 'ACTIVE', auth_source = 'PRIVY', updated_at = NOW()`,
        [emailHash]
    );

    const userResult = await query<{ user_id: string }>(
        `SELECT user_id FROM users WHERE email_hash = $1 LIMIT 1`,
        [emailHash]
    );
    const userId = userResult.rows[0]?.user_id;
    if (!userId) throw new Error('Failed to resolve seeded user_id');

    // 2. Upsert Privy auth identity
    await query(
        `INSERT INTO user_auth_identities (
           user_id, provider, provider_user_id, provider_subject,
           login_method, email_hash, is_primary, claims_snapshot
         ) VALUES (
           $1, 'PRIVY', $2, $2, 'EMAIL', $3, TRUE,
           '{"env":"seed","source":"genesis-seed-script"}'::jsonb
         )
         ON CONFLICT (provider, provider_user_id) DO UPDATE
           SET is_primary = TRUE, updated_at = NOW()`,
        [userId, SEED_PRIVY_USER_ID, emailHash]
    );

    const authIdentityResult = await query<{ auth_identity_id: string }>(
        `SELECT auth_identity_id FROM user_auth_identities
         WHERE provider = 'PRIVY' AND provider_user_id = $1 LIMIT 1`,
        [SEED_PRIVY_USER_ID]
    );
    const authIdentityId = authIdentityResult.rows[0]?.auth_identity_id;
    if (!authIdentityId) throw new Error('Failed to resolve seed auth_identity_id');

    // 3. Upsert treasury account â€” now with account_type + wallet_provider
    await query(
        `INSERT INTO treasury_accounts (
           account_id, owner_id, wallet_address, mode, kyc_level, risk_tier,
           jurisdiction, partner_pricing_id, status,
           account_type, wallet_provider
         ) VALUES (
           'pta-seed01', $1, $2, 0, 1, 1,
           'US', 'seed-pricing', 'ACTIVE',
           'END_USER', 'PRIVY'
         )
         ON CONFLICT (account_id) DO UPDATE
           SET owner_id        = EXCLUDED.owner_id,
               wallet_provider = 'PRIVY',
               account_type    = 'END_USER',
               status          = 'ACTIVE',
               updated_at      = NOW()`,
        [userId, SEED_EOA_ADDRESS]
    );

    // 4. Upsert Privy embedded EOA wallet profile
    await query(
        `WITH updated AS (
           UPDATE wallet_profiles
           SET user_id = $1,
               account_id = 'pta-seed01',
               auth_identity_id = $2,
               wallet_type = 'EMBEDDED_EOA',
               custody_model = 'USER_CONTROLLED',
               is_primary = TRUE,
               status = 'ACTIVE',
               capabilities = '{"canSign":true,"canReceive":true}'::jsonb,
               metadata = '{"source":"seed"}'::jsonb,
               updated_at = NOW()
           WHERE wallet_provider = 'PRIVY'
             AND chain_id = $3
             AND lower(address) = lower($4)
           RETURNING wallet_id
         )
         INSERT INTO wallet_profiles (
           user_id, account_id, auth_identity_id,
           wallet_provider, wallet_type, custody_model,
           chain_id, address, is_primary, status,
           capabilities, metadata
         )
         SELECT
           $1, 'pta-seed01', $2,
           'PRIVY', 'EMBEDDED_EOA', 'USER_CONTROLLED',
           $3, $4, TRUE, 'ACTIVE',
           '{"canSign":true,"canReceive":true}'::jsonb,
           '{"source":"seed"}'::jsonb
         WHERE NOT EXISTS (SELECT 1 FROM updated)`,
        [userId, authIdentityId, SEED_CHAIN_ID, SEED_EOA_ADDRESS]
    );

    const eoaWalletResult = await query<{ wallet_id: string }>(
        `SELECT wallet_id FROM wallet_profiles
         WHERE wallet_provider = 'PRIVY' AND chain_id = $1 AND address = $2 LIMIT 1`,
        [SEED_CHAIN_ID, SEED_EOA_ADDRESS]
    );
    const eoaWalletId = eoaWalletResult.rows[0]?.wallet_id ?? null;

    // 5. Upsert ZeroDev smart account (child of EOA)
    await query(
        `WITH updated AS (
           UPDATE wallet_profiles
           SET user_id = $1,
               account_id = 'pta-seed01',
               auth_identity_id = $2,
               wallet_type = 'SMART_ACCOUNT',
               custody_model = 'DELEGATED_SMART_ACCOUNT',
               parent_wallet_id = $5,
               is_primary = FALSE,
               status = 'ACTIVE',
               capabilities = '{"canBatchTx":true,"canSponsorGas":true,"canSign":true}'::jsonb,
               metadata = '{"source":"seed","kernelVersion":"3.1"}'::jsonb,
               updated_at = NOW()
           WHERE wallet_provider = 'ZERODEV'
             AND chain_id = $3
             AND lower(address) = lower($4)
           RETURNING wallet_id
         )
         INSERT INTO wallet_profiles (
           user_id, account_id, auth_identity_id,
           wallet_provider, wallet_type, custody_model,
           chain_id, address, parent_wallet_id, is_primary, status,
           capabilities, metadata
         )
         SELECT
           $1, 'pta-seed01', $2,
           'ZERODEV', 'SMART_ACCOUNT', 'DELEGATED_SMART_ACCOUNT',
           $3, $4, $5, FALSE, 'ACTIVE',
           '{"canBatchTx":true,"canSponsorGas":true,"canSign":true}'::jsonb,
           '{"source":"seed","kernelVersion":"3.1"}'::jsonb
         WHERE NOT EXISTS (SELECT 1 FROM updated)`,
        [userId, authIdentityId, SEED_CHAIN_ID, SEED_SMART_ACCOUNT, eoaWalletId]
    );

    // 6. Back-fill auth_identity_id + primary_wallet_id on the account
    if (authIdentityId && eoaWalletId) {
        await query(
            `UPDATE treasury_accounts
             SET auth_identity_id  = $1,
                 primary_wallet_id = $2,
                 updated_at        = NOW()
             WHERE account_id = 'pta-seed01'`,
            [authIdentityId, eoaWalletId]
        );
    }

    // 7. Seed a Zero Hash platform participant mapping
    await query(
        `INSERT INTO provider_participants (
           account_id, provider, participant_type,
           provider_participant_code, jurisdiction_code, status, metadata
         ) VALUES (
           'pta-seed01', 'ZERO_HASH', 'SENDER',
           'GR-SEED-SENDER-001', 'US', 'APPROVED',
           '{"source":"seed"}'::jsonb
         )
         ON CONFLICT (account_id, provider, participant_type) DO NOTHING`
    );

    await query(
        `INSERT INTO identity_cases (
       user_id, kyc_level, kyc_provider, provider_ref, docs_verified, liveness_pass,
       address_verified, sanction_status, aml_status, jurisdiction
     ) VALUES (
       $1, 1, 'seed-provider', 'seed-ref-001', TRUE, TRUE,
       TRUE, 'PASS', 'PASS', 'US'
     )
     ON CONFLICT DO NOTHING`,
        [userId]
    );

    await query(
        `INSERT INTO remittance_quotes (
      quote_id, account_id, send_amount, send_currency, receive_currency,
      receive_amount, fx_rate, platform_fee_bps, fx_spread_bps, total_cost,
      eta_seconds, expires_at, corridor, payout_method
    ) VALUES (
      'quote-seed-001', 'pta-seed01', 250000000, 'USDC', 'PHP',
      14000000000, 56.00, 100, 40, 252500000,
      300, NOW() + INTERVAL '10 minutes', 'US-PH', 'bank_transfer'
    )
    ON CONFLICT (quote_id) DO NOTHING`
    );

    await query(
        `INSERT INTO remittance_orders (
      order_id, quote_id, account_id, reservation_id, status,
      corridor, payout_method, recipient_ref, send_amount, receive_amount,
      fx_rate, platform_fee, partner_fee, fx_revenue, settled_at
    ) VALUES (
      'ord-seed-001', 'quote-seed-001', 'pta-seed01', 'res-seed-001', 'SETTLED',
      'US-PH', 'bank_transfer', 'recip-seed-001', 250000000, 14000000000,
      56.00, 2500000, 500000, 1000000, NOW() - INTERVAL '1 day'
    )
    ON CONFLICT (order_id) DO NOTHING`
    );

    await query(
        `INSERT INTO yield_accruals (account_id, protocol, amount, apy_bps, accrued_at)
     VALUES
       ('pta-seed01', 'aave_v3', 1800000, 520, NOW() - INTERVAL '5 days'),
       ('pta-seed01', 'balancer_v3', 2200000, 540, NOW() - INTERVAL '2 days')
     ON CONFLICT DO NOTHING`
    );
}

async function ensureAdminControlPlane(partnerId: string | undefined) {
    await query(
        `INSERT INTO admin_users (email, display_name, role, status)
     VALUES
       ('ops@genesisreserve.local', 'Operations Lead', 'OPS', 'ACTIVE'),
       ('compliance@genesisreserve.local', 'Compliance Lead', 'COMPLIANCE', 'ACTIVE')
     ON CONFLICT (email) DO UPDATE
       SET status = 'ACTIVE', updated_at = NOW()`
    );

    const queueSeed = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM support_queue`
    );

    if (Number(queueSeed.rows[0]?.count || 0) === 0) {
        await query(
            `INSERT INTO support_queue (category, subject, amount_usdc, status, account_id, priority, details)
       VALUES
         ('Compliance hold', 'Travel rule verification pending', 2500000000, 'PENDING', 'pta-seed01', 5, '{"source":"seed"}'),
         ('Travel rule', 'Beneficiary VASP confirmation required', 3200000000, 'REVIEW', 'pta-seed01', 4, '{"source":"seed"}'),
         ('KYC retry', 'Document resubmission requested', NULL, 'AWAITING', 'pta-seed01', 3, '{"source":"seed"}'),
         ('Support', 'Settlement trace request', 920000000, 'ESCALATED', 'pta-seed01', 2, '{"source":"seed"}')`
        );
    }

    if (partnerId) {
        await query(
            `INSERT INTO notifications (account_id, partner_id, event_type, channel, title, message, metadata)
       VALUES (
         'pta-seed01', $1, 'REM_SETTLED', 'IN_APP',
         'Seed settlement complete',
         'Seed remittance order ord-seed-001 was settled successfully.',
         '{"orderId":"ord-seed-001"}'
       )
       ON CONFLICT DO NOTHING`,
            [partnerId]
        );
    }
}

async function run() {
    logger.info('Starting seed data upsert');
    const partnerId = await ensurePartner();
    await ensureUserAndAccount();
    await ensureAdminControlPlane(partnerId);
    logger.info({ partnerId }, 'Seed completed successfully');
}

run()
    .then(async () => {
        await pool.end();
        process.exit(0);
    })
    .catch(async (err) => {
        logger.error({ err }, 'Seed failed');
        await pool.end().catch(() => undefined);
        process.exit(1);
    });

