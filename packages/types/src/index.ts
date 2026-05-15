// Genesis Reserve — Shared Types
// Import from '@genesis/types' in both apps/api and apps/web

export type ChainId = 42161 | 421614; // Arbitrum One | Arbitrum Sepolia

export interface GenesisUser {
  userId: string;
  walletAddress: string;
  kycTier: 'none' | 'basic' | 'enhanced';
  createdAt: string;
}

export interface TreasuryAccount {
  accountId: string;
  userId: string;
  usdcBalance: string; // BigInt string, wei
  yieldAccrued: string;
  status: 'active' | 'frozen' | 'closed';
}

export interface DepositQuote {
  quoteId: string;
  amountIn: string;
  amountOut: string;
  strategy: string;
  apyBps: number;
  expiresAt: string;
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  detail?: string;
}
