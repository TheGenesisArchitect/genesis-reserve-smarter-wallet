import { createHash } from 'crypto';
import { IncomingHttpHeaders } from 'http';
import { createRemoteJWKSet, JWTPayload, jwtVerify } from 'jose';

export interface AuthenticatedPrivyUser {
  provider: 'PRIVY';
  providerUserId: string;
  subject: string;
  loginMethod?: string;
  emailHash?: string;
  phoneHash?: string;
  walletAddress?: string;
  smartAccountAddress?: string;
  verified: boolean;
  claims: Record<string, unknown>;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normaliseAddress(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? value.toLowerCase() : undefined;
}

function pickString(payload: JWTPayload | Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

export class PrivyAuthService {
  private readonly jwksUrl: string;
  private readonly expectedIssuer: string;
  private readonly expectedAudience: string;
  private readonly allowUnverifiedDev: boolean;
  private jwks: ReturnType<typeof createRemoteJWKSet> | null;

  constructor() {
    this.jwksUrl = process.env.PRIVY_JWKS_URL || '';
    this.expectedIssuer = process.env.PRIVY_EXPECTED_ISSUER || '';
    this.expectedAudience = process.env.PRIVY_APP_ID || process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';
    this.allowUnverifiedDev = (process.env.PRIVY_ALLOW_UNVERIFIED_DEV || 'true') === 'true';
    this.jwks = this.jwksUrl ? createRemoteJWKSet(new URL(this.jwksUrl)) : null;
  }

  isConfigured(): boolean {
    return Boolean(this.jwks && this.expectedAudience);
  }

  async authenticate(headers: IncomingHttpHeaders | Record<string, unknown>): Promise<AuthenticatedPrivyUser | null> {
    const authHeader = typeof headers.authorization === 'string'
      ? headers.authorization
      : typeof headers['Authorization'] === 'string'
        ? String(headers['Authorization'])
        : undefined;

    if (authHeader?.startsWith('Bearer ') && this.jwks) {
      const token = authHeader.slice(7);
      const result = await jwtVerify(token, this.jwks, {
        audience: this.expectedAudience,
        issuer: this.expectedIssuer || undefined,
      });
      return this.toAuthenticatedUser(result.payload, true);
    }

    if (this.allowUnverifiedDev && process.env.NODE_ENV !== 'production') {
      const providerUserId = this.headerValue(headers, 'x-privy-user-id')
        || this.headerValue(headers, 'x-wallet-address')
        || this.headerValue(headers, 'x-genesis-wallet-address');

      if (!providerUserId) return null;

      const claims: Record<string, unknown> = {
        sub: providerUserId,
        email: this.headerValue(headers, 'x-privy-email'),
        phone_number: this.headerValue(headers, 'x-privy-phone'),
        wallet_address: this.headerValue(headers, 'x-wallet-address') || this.headerValue(headers, 'x-genesis-wallet-address'),
        smart_account_address: this.headerValue(headers, 'x-smart-account-address'),
        login_method: this.headerValue(headers, 'x-privy-login-method') || 'wallet',
      };

      return this.toAuthenticatedUser(claims, false);
    }

    return null;
  }

  private headerValue(headers: IncomingHttpHeaders | Record<string, unknown>, key: string): string | undefined {
    const direct = headers[key as keyof typeof headers];
    if (typeof direct === 'string' && direct.length > 0) return direct;
    const lower = headers[key.toLowerCase() as keyof typeof headers];
    if (typeof lower === 'string' && lower.length > 0) return lower;
    return undefined;
  }

  private toAuthenticatedUser(payload: JWTPayload | Record<string, unknown>, verified: boolean): AuthenticatedPrivyUser {
    const providerUserId = pickString(payload, ['sub', 'user_id', 'userId']) || 'unknown-privy-user';
    const email = pickString(payload, ['email']);
    const phone = pickString(payload, ['phone_number', 'phone']);

    return {
      provider: 'PRIVY',
      providerUserId,
      subject: providerUserId,
      loginMethod: pickString(payload, ['login_method', 'loginMethod']),
      emailHash: email ? sha256(email.trim().toLowerCase()) : undefined,
      phoneHash: phone ? sha256(phone.trim()) : undefined,
      walletAddress: normaliseAddress(payload['wallet_address']) || normaliseAddress(payload['address']),
      smartAccountAddress: normaliseAddress(payload['smart_account_address']) || normaliseAddress(payload['smartAccountAddress']),
      verified,
      claims: payload as Record<string, unknown>,
    };
  }
}
