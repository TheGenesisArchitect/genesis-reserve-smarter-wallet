# Genesis Reserve — Privy Integration

**Embedded wallet + ERC-4337 frontend for GenesisVault.sol on Arbitrum One**

<!-- Updated: 2026-05-07 - Fixed Stripe key mismatch for card linking -->

## What This Is

The frontend layer of the Genesis Reserve Digital Wallet. Connects Privy's
embedded wallet SDK (email/SMS login, no seed phrase, no ETH required) to the
live GenesisVault.sol ERC-4626 contract on Arbitrum One mainnet.

**Deployed contracts (Arbitrum One, from Week 1 deployment):**

| Contract | Address |
|---|---|
| GenesisVault.sol | `0xe164997D48395B4e24aB0f9F66c57DEA38C5E041` |
| StrategyRouter.sol | `0xD7ff8383eBBE3B1023d95A3f14c32D9941Ac9e84` |
| ComplianceRegistry.sol | `0x6D58678562387c400964737884E78f2f12e1c495` |
| AaveV3Adapter | `0xa6F089338Ae75306217336054B36C02c3Bc5554D` |
| BalancerV3Adapter | `0x6291Ed9FC028F872D14B1da79de60a63e7Ec6624` |

---

## Setup (15 minutes)

### 1. Install dependencies

```bash
npm install
```

### 2. Create Privy account

1. Go to [dashboard.privy.io](https://dashboard.privy.io)
2. Create a new app → name it "Genesis Reserve"
3. Under **Chains**, add **Arbitrum One** (Chain ID 42161)
4. Under **Login Methods**, enable: Email, SMS, Google, Wallet
5. Copy your **App ID** from Settings

### 3. Create ZeroDev project (Paymaster — gasless transactions)

1. Go to [dashboard.zerodev.app](https://dashboard.zerodev.app)
2. Create project → select **Arbitrum One**
3. Copy the **Project ID**, **Bundler URL**, and **Paymaster URL**

### 4. Configure environment

```bash
cp .env.example .env.local
```

Fill in:
```
NEXT_PUBLIC_PRIVY_APP_ID=          # From Privy dashboard
NEXT_PUBLIC_ZERODEV_PROJECT_ID=    # From ZeroDev dashboard
NEXT_PUBLIC_ZERODEV_BUNDLER_URL=   # From ZeroDev dashboard
NEXT_PUBLIC_ZERODEV_PAYMASTER_URL= # From ZeroDev dashboard
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=# From Stripe dashboard
STRIPE_SECRET_KEY=                 # From Stripe dashboard (server-side only)
STRIPE_WEBHOOK_SECRET=             # From Stripe dashboard
NEXT_PUBLIC_ALCHEMY_API_KEY=       # Already in use — same key as backend
DATABASE_URL=                      # Optional: enable card-service Postgres persistence
DATABASE_SSL=false                 # Local Postgres usually false; hosted DB usually true
```

The contract addresses are already hardcoded in `src/config/contracts.ts`
from the Week 1 deployment manifest. Do not change these.

### 5. Run dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## File Structure

```
src/
├── config/
│   ├── contracts.ts     ← All contract addresses + protocol constants
│   ├── privy.config.ts  ← Privy appearance + login methods
│   └── wagmi.config.ts  ← wagmi v2 + Alchemy RPC
│
├── abis/
│   └── vault.abi.ts     ← GenesisVault + ComplianceRegistry + USDC ABIs
│
├── hooks/
│   ├── useGenesisVault.ts   ← deposit(), withdraw(), balances — CORE HOOK
│   ├── useYieldTicker.ts    ← Live APY + per-second balance interpolation
│   └── useComplianceGate.ts ← KYC tier check before any transaction
│
├── components/
│   ├── WalletBalance.tsx    ← Hero balance card + yield ticker display
│   └── DepositFlow.tsx      ← Full deposit UI with compliance gate
│
├── providers.tsx            ← Root provider tree (Privy → wagmi → QueryClient)
│
└── app/
    └── page.tsx             ← Genesis Terminal test page
```

---

## Testing as Senior User (Anthony)

### Test 1 — Login + wallet creation (Day 1)
1. Open app → click "Connect"
2. Enter your email → Privy sends magic link
3. Click magic link → Privy creates embedded wallet silently
4. Wallet address appears in header — this is your Arbitrum One smart account

### Test 2 — See live balance (requires USDC in vault)
1. Once wallet is connected, `WalletBalance` reads from `GenesisVault.balanceOf()`
2. If balance > 0, yield ticker starts interpolating every second
3. APY displayed from on-chain share price delta

### Test 3 — First deposit
1. You need USDC in your wallet first (use Arbitrum One bridge or get from
   the team's test allocation)
2. Click "Deposit USDC" → enter amount → "Deposit USDC →"
3. Privy prompts twice: once for USDC approve, once for vault deposit
4. Both transactions go through — no ETH needed (ZeroDev Paymaster covers gas)
5. Balance updates in `WalletBalance` after confirmation

> **Note for Week 10:** After Permit2 integration, the two Privy prompts
> collapse to one. The user signs once and both approve + deposit execute.

### Test 4 — Verify on Arbiscan
After a successful deposit, click "View on Arbiscan ↗" in the success screen.
Confirm:
- Transaction is to GenesisVault address `0xe164997D...`
- Function called is `deposit`
- Your smart account address is the `receiver`

---

## Testnet mode

To run against Arbitrum Sepolia (testnet) instead of mainnet:

```bash
NEXT_PUBLIC_CHAIN_ID=421614 npm run dev
```

Update `TESTNET_CONTRACTS` in `contracts.ts` with your testnet deployment
addresses from `deployments/arbitrum_testnet/manifest.json`.

Get testnet USDC from the Circle faucet:
`0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` (Arbitrum Sepolia)

---

## Known Limitations (Week 2 MVP)

| Issue | Resolution |
|---|---|
| Two signing prompts for deposit (approve + deposit) | Fixed in Week 10 with Permit2 |
| No SendFlow component | Builds Week 4–5 |
| No APY history chart | Builds Week 8 |
| Morpho allocation showing 0% | Morpho not on Arbitrum — researching Week 3 |
| KYC gate returns Tier 0 for new wallets | Real Onfido integration Week 3–4 |
| Gas paid by dev Paymaster | Production Paymaster funded before mainnet canary |

---

## Roadmap Integration

| Roadmap Week | Frontend Milestone |
|---|---|
| Week 3 | Privy login live, WalletBalance reading real data |
| Week 4 | DepositFlow wired, first real deposit executed by Anthony |
| Week 5 | SendFlow built, first real transfer |
| Week 7 | Fireblocks protocol custody live |
| Week 9 | Stripe card integration, JIT webhook bridge |
| Week 10 | Permit2 collapses approve+deposit to one signature |
| Week 13 | $100K cap, 10 pilot users onboarded |

---

## Contact

Anthony Beedles — anthony@genesisreserve.io
