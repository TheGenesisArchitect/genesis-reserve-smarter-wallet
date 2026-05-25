// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/src/config/privy.config.ts
//
// Privy initialization config.
// Docs: https://docs.privy.io/guide/react/configuration
// ─────────────────────────────────────────────────────────────────────────────

import type { PrivyClientConfig } from '@privy-io/react-auth'
import { arbitrum, arbitrumSepolia, base, polygon, optimism, mainnet } from 'viem/chains'
import { ACTIVE_CHAIN, IS_TESTNET } from './contracts'

export const PRIVY_CONFIG: PrivyClientConfig = {
  // ── Appearance ──────────────────────────────────────────────────────────────
  appearance: {
    theme: 'dark',
    accentColor: '#C9A84C',
    logo: '/genesis-logo.png',
    walletChainType: 'ethereum-only',
    showWalletLoginFirst: false,
  },

  // ── Login Methods ─────────────────────────────────────────────────────────
  loginMethods: [
    'email',
    'sms',
    'google',
  ],

  // ── Embedded Wallet ───────────────────────────────────────────────────────
  embeddedWallets: {
    ethereum: {
      createOnLogin: 'users-without-wallets',
    },
    showWalletUIs: false,
    priceDisplay: {
      primary: 'fiat-currency',
      secondary: 'native-token',
    },
  },

  // ── MFA (Optional — enable for high-value accounts) ───────────────────────
  mfa: {
    noPromptOnMfaRequired: false,
  },

  // ── Supported Chains ──────────────────────────────────────────────────────
  // Arbitrum One is the vault chain. Mainnet needed for ETH bridge source.
  // Base/Polygon/Optimism for portfolio reads.
  supportedChains: IS_TESTNET
    ? [arbitrumSepolia]
    : [mainnet, arbitrum, arbitrumSepolia, base, polygon, optimism],

  defaultChain: ACTIVE_CHAIN,

}
