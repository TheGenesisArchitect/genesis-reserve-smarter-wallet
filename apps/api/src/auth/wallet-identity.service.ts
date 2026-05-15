import { createHash } from 'crypto';
import { PoolClient } from 'pg';
import { query, withTransaction } from '../config/db';
import { AuthenticatedPrivyUser } from './privy-auth.service';

export interface RegisterWalletInput {
  auth: AuthenticatedPrivyUser;
  embeddedWalletAddress?: string;
  smartAccountAddress?: string;
  externalWalletAddress?: string;
  chainId?: number;
  country?: string;
  jurisdiction?: string;
  loginMethod?: string;
  accountId?: string;
}

export interface WalletRegistrationResult {
  userId: string;
  accountId: string;
  authIdentityId: string;
  primaryWalletId: string | null;
  wallets: Array<{
    walletId: string;
    walletProvider: string;
    walletType: string;
    address: string | null;
    chainId: number | null;
    isPrimary: boolean;
  }>;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normaliseAddress(value?: string): string | undefined {
  if (!value) return undefined;
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? value.toLowerCase() : undefined;
}

function buildAccountId(userId: string): string {
  const compact = userId.replace(/-/g, '').slice(0, 12);
  return `pta-${compact}`;
}

export class WalletIdentityService {
  async resolveUserIdByProviderUserId(providerUserId: string): Promise<string | null> {
    const result = await query<{ user_id: string }>(
      `SELECT user_id
       FROM user_auth_identities
       WHERE provider = 'PRIVY' AND provider_user_id = $1
       LIMIT 1`,
      [providerUserId]
    );

    return result.rows[0]?.user_id || null;
  }

  async registerWallets(input: RegisterWalletInput): Promise<WalletRegistrationResult> {
    return withTransaction(async (client) => {
      const userId = await this.ensureUser(client, input);
      const authIdentityId = await this.ensureAuthIdentity(client, userId, input);
      const accountId = await this.ensureTreasuryAccount(client, userId, authIdentityId, input);

      const embeddedWalletId = input.embeddedWalletAddress
        ? await this.upsertWalletProfile(client, {
            userId,
            accountId,
            authIdentityId,
            walletProvider: 'PRIVY',
            walletType: 'EMBEDDED_EOA',
            custodyModel: 'USER_CONTROLLED',
            address: input.embeddedWalletAddress,
            chainId: input.chainId,
            isPrimary: !input.smartAccountAddress,
          })
        : null;

      const smartAccountId = input.smartAccountAddress
        ? await this.upsertWalletProfile(client, {
            userId,
            accountId,
            authIdentityId,
            walletProvider: 'ZERODEV',
            walletType: 'SMART_ACCOUNT',
            custodyModel: 'DELEGATED_SMART_ACCOUNT',
            address: input.smartAccountAddress,
            chainId: input.chainId,
            parentWalletId: embeddedWalletId || undefined,
            isPrimary: true,
          })
        : null;

      const externalWalletId = input.externalWalletAddress
        ? await this.upsertWalletProfile(client, {
            userId,
            accountId,
            authIdentityId,
            walletProvider: 'EXTERNAL',
            walletType: 'EXTERNAL_EOA',
            custodyModel: 'USER_CONTROLLED',
            address: input.externalWalletAddress,
            chainId: input.chainId,
            isPrimary: false,
          })
        : null;

      const primaryWalletId = smartAccountId || embeddedWalletId || externalWalletId;
      const primaryAddress = normaliseAddress(input.smartAccountAddress)
        || normaliseAddress(input.embeddedWalletAddress)
        || normaliseAddress(input.externalWalletAddress)
        || input.auth.walletAddress
        || input.auth.smartAccountAddress
        || '0x0000000000000000000000000000000000000001';

      await client.query(
        `UPDATE treasury_accounts
         SET auth_identity_id = $2,
             primary_wallet_id = $3,
             wallet_provider = $4,
             wallet_address = COALESCE(NULLIF(wallet_address, ''), $5),
             jurisdiction = COALESCE(NULLIF(jurisdiction, ''), $6),
             updated_at = NOW()
         WHERE account_id = $1`,
        [
          accountId,
          authIdentityId,
          primaryWalletId,
          primaryWalletId === smartAccountId ? 'HYBRID' : 'PRIVY',
          primaryAddress,
          (input.jurisdiction || input.country || 'US').slice(0, 2).toUpperCase(),
        ]
      );

      const wallets = await client.query<{
        wallet_id: string;
        wallet_provider: string;
        wallet_type: string;
        address: string | null;
        chain_id: number | null;
        is_primary: boolean;
      }>(
        `SELECT wallet_id, wallet_provider, wallet_type, address, chain_id, is_primary
         FROM wallet_profiles
         WHERE account_id = $1
         ORDER BY is_primary DESC, created_at ASC`,
        [accountId]
      );

      return {
        userId,
        accountId,
        authIdentityId,
        primaryWalletId,
        wallets: wallets.rows.map((row) => ({
          walletId: row.wallet_id,
          walletProvider: row.wallet_provider,
          walletType: row.wallet_type,
          address: row.address,
          chainId: row.chain_id,
          isPrimary: row.is_primary,
        })),
      };
    });
  }

  async getAccountsForUser(userId: string) {
    const result = await query<{
      account_id: string;
      status: string;
      mode: number;
      primary_wallet_id: string | null;
      wallet_provider: string;
      wallet_address: string;
    }>(
      `SELECT account_id, status, mode, primary_wallet_id, wallet_provider, wallet_address
       FROM treasury_accounts
       WHERE owner_id = $1
       ORDER BY created_at ASC`,
      [userId]
    );

    return result.rows;
  }

  async assertAccountOwnership(userId: string, accountId: string): Promise<boolean> {
    const result = await query(
      `SELECT 1
       FROM treasury_accounts
       WHERE account_id = $1 AND owner_id = $2
       LIMIT 1`,
      [accountId, userId]
    );

    return Boolean(result.rows[0]);
  }

  private async ensureUser(client: PoolClient, input: RegisterWalletInput): Promise<string> {
    const syntheticEmailHash = `privy_${sha256(input.auth.providerUserId)}`;
    const emailHash = input.auth.emailHash || syntheticEmailHash;
    const country = (input.country || input.jurisdiction || 'US').slice(0, 2).toUpperCase();

    const existingByIdentity = await client.query<{ user_id: string }>(
      `SELECT user_id
       FROM user_auth_identities
       WHERE provider = 'PRIVY' AND provider_user_id = $1
       LIMIT 1`,
      [input.auth.providerUserId]
    );

    if (existingByIdentity.rows[0]?.user_id) {
      await client.query(
        `UPDATE users
         SET auth_source = 'PRIVY',
             phone_hash = COALESCE($2, phone_hash),
             country = COALESCE(country, $3),
             updated_at = NOW()
         WHERE user_id = $1`,
        [existingByIdentity.rows[0].user_id, input.auth.phoneHash || null, country]
      );
      return existingByIdentity.rows[0].user_id;
    }

    const existingByEmail = await client.query<{ user_id: string }>(
      `SELECT user_id
       FROM users
       WHERE email_hash = $1
       LIMIT 1`,
      [emailHash]
    );

    if (existingByEmail.rows[0]?.user_id) {
      await client.query(
        `UPDATE users
         SET auth_source = 'PRIVY',
             phone_hash = COALESCE($2, phone_hash),
             updated_at = NOW()
         WHERE user_id = $1`,
        [existingByEmail.rows[0].user_id, input.auth.phoneHash || null]
      );
      return existingByEmail.rows[0].user_id;
    }

    const inserted = await client.query<{ user_id: string }>(
      `INSERT INTO users (email_hash, phone_hash, country, risk_tier, status, auth_source)
       VALUES ($1, $2, $3, 0, 'ACTIVE', 'PRIVY')
       RETURNING user_id`,
      [emailHash, input.auth.phoneHash || null, country]
    );

    return inserted.rows[0].user_id;
  }

  private async ensureAuthIdentity(client: PoolClient, userId: string, input: RegisterWalletInput): Promise<string> {
    const loginMethod = (input.loginMethod || input.auth.loginMethod || 'wallet').toUpperCase();
    const upserted = await client.query<{ auth_identity_id: string }>(
      `INSERT INTO user_auth_identities (
          user_id, provider, provider_user_id, provider_subject, login_method,
          email_hash, phone_hash, is_primary, claims_snapshot, last_authenticated_at
       ) VALUES (
          $1, 'PRIVY', $2, $3, $4, $5, $6, TRUE, $7::jsonb, NOW()
       )
       ON CONFLICT (provider, provider_user_id) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           provider_subject = EXCLUDED.provider_subject,
           login_method = EXCLUDED.login_method,
           email_hash = COALESCE(EXCLUDED.email_hash, user_auth_identities.email_hash),
           phone_hash = COALESCE(EXCLUDED.phone_hash, user_auth_identities.phone_hash),
           claims_snapshot = EXCLUDED.claims_snapshot,
           last_authenticated_at = NOW(),
           updated_at = NOW()
       RETURNING auth_identity_id`,
      [
        userId,
        input.auth.providerUserId,
        input.auth.subject,
        loginMethod,
        input.auth.emailHash || null,
        input.auth.phoneHash || null,
        JSON.stringify(input.auth.claims || {}),
      ]
    );

    return upserted.rows[0].auth_identity_id;
  }

  private async ensureTreasuryAccount(client: PoolClient, userId: string, authIdentityId: string, input: RegisterWalletInput): Promise<string> {
    const requestedAccountId = input.accountId;

    if (requestedAccountId) {
      const owned = await client.query<{ account_id: string }>(
        `SELECT account_id FROM treasury_accounts WHERE account_id = $1 AND owner_id = $2 LIMIT 1`,
        [requestedAccountId, userId]
      );
      if (!owned.rows[0]) {
        throw new Error('Account ownership check failed');
      }
      return requestedAccountId;
    }

    const existing = await client.query<{ account_id: string }>(
      `SELECT account_id FROM treasury_accounts
       WHERE owner_id = $1 OR auth_identity_id = $2
       ORDER BY created_at ASC
       LIMIT 1`,
      [userId, authIdentityId]
    );

    if (existing.rows[0]?.account_id) return existing.rows[0].account_id;

    const accountId = buildAccountId(userId);
    const walletAddress = normaliseAddress(input.smartAccountAddress)
      || normaliseAddress(input.embeddedWalletAddress)
      || normaliseAddress(input.externalWalletAddress)
      || input.auth.smartAccountAddress
      || input.auth.walletAddress
      || '0x0000000000000000000000000000000000000001';

    await client.query(
      `INSERT INTO treasury_accounts (
         account_id, owner_id, wallet_address, mode, kyc_level, risk_tier,
         jurisdiction, partner_pricing_id, status, auth_identity_id, wallet_provider, account_type
       ) VALUES (
         $1, $2, $3, 0, 0, 0, $4, 'privy-self-serve', 'ACTIVE', $5, 'PRIVY', 'END_USER'
       )
       ON CONFLICT (account_id) DO UPDATE
       SET owner_id = EXCLUDED.owner_id,
           auth_identity_id = EXCLUDED.auth_identity_id,
           updated_at = NOW()`,
      [accountId, userId, walletAddress, (input.jurisdiction || input.country || 'US').slice(0, 2).toUpperCase(), authIdentityId]
    );

    return accountId;
  }

  private async upsertWalletProfile(client: PoolClient, input: {
    userId: string;
    accountId: string;
    authIdentityId: string;
    walletProvider: string;
    walletType: string;
    custodyModel: string;
    address?: string;
    chainId?: number;
    parentWalletId?: string;
    isPrimary: boolean;
  }): Promise<string> {
    const address = normaliseAddress(input.address);
    if (!address) throw new Error('Wallet address is required');

    const existing = await client.query<{ wallet_id: string }>(
      `SELECT wallet_id
       FROM wallet_profiles
       WHERE wallet_provider = $1 AND chain_id IS NOT DISTINCT FROM $2 AND address = $3
       LIMIT 1`,
      [input.walletProvider, input.chainId ?? null, address]
    );

    if (existing.rows[0]?.wallet_id) {
      await client.query(
        `UPDATE wallet_profiles
         SET user_id = $2,
             account_id = $3,
             auth_identity_id = $4,
             wallet_type = $5,
             custody_model = $6,
             parent_wallet_id = COALESCE($7, parent_wallet_id),
             is_primary = $8,
             status = 'ACTIVE',
             updated_at = NOW()
         WHERE wallet_id = $1`,
        [
          existing.rows[0].wallet_id,
          input.userId,
          input.accountId,
          input.authIdentityId,
          input.walletType,
          input.custodyModel,
          input.parentWalletId || null,
          input.isPrimary,
        ]
      );
      return existing.rows[0].wallet_id;
    }

    const inserted = await client.query<{ wallet_id: string }>(
      `INSERT INTO wallet_profiles (
         user_id, account_id, auth_identity_id, wallet_provider, wallet_type,
         custody_model, chain_id, address, parent_wallet_id, is_primary, status
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE'
       ) RETURNING wallet_id`,
      [
        input.userId,
        input.accountId,
        input.authIdentityId,
        input.walletProvider,
        input.walletType,
        input.custodyModel,
        input.chainId ?? null,
        address,
        input.parentWalletId || null,
        input.isPrimary,
      ]
    );

    return inserted.rows[0].wallet_id;
  }
}
