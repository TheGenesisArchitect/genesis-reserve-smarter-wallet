<div align="center">

# Genesis Reserve

**Institutional-grade treasury infrastructure for the stablecoin economy**

[![CI](https://github.com/TheGenesisArchitect/genesis-reserve/actions/workflows/ci.yml/badge.svg)](https://github.com/TheGenesisArchitect/genesis-reserve/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](LICENSE)
[![Network: Arbitrum One](https://img.shields.io/badge/Network-Arbitrum%20One-blue.svg)](https://arbiscan.io/)
[![Stablecoin: USDC](https://img.shields.io/badge/Stablecoin-USDC-2775CA.svg)](https://www.circle.com/usdc)

*Deposit USDC. Earn institutional yield. Move money globally — without a bank.*

</div>

---

## What Is Genesis Reserve?

Genesis Reserve is a full-stack treasury operating system that gives individuals and businesses access to the same yield infrastructure previously available only to hedge funds and prime brokerages.

Users connect their wallet, pass KYC, and deposit USDC. The protocol automatically allocates across audited DeFi yield strategies (Aave, Morpho, Balancer), executes cross-chain transfers via Circle's CCTP, and provides a debit card backed by their on-chain balance — all governed by on-chain compliance logic and a production-grade API gateway.

**Not a prototype. The contracts are live on Arbitrum One mainnet.**

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          User / Operator                              │
└───────────────────────┬──────────────────────────────────────────────┘
                        │
              ┌─────────▼──────────┐
              │   Next.js Frontend  │  apps/web  · port 3200
              │   Privy Auth + EIP-4337 Smart Account                  │
              └─────────┬──────────┘
                        │ BFF calls (server-side only)
              ┌─────────▼──────────┐
              │   Express API GW   │  apps/api  · port 4000
              │   Partner + Admin Auth · Rate Limiting · Idempotency   │
              └──┬──────┬──────────┘
                 │      │
    ┌────────────▼─┐  ┌─▼──────────────┐
    │  PostgreSQL  │  │     Redis       │
    │  Ledger DB   │  │  Rate + Queue  │
    └──────────────┘  └─────────────────┘
                 │
    ┌────────────▼──────────────────────┐
    │        Arbitrum One Mainnet        │
    │  GenesisVault (ERC-4626)           │
    │  StrategyRouter → Aave / Morpho    │
    │  ComplianceRegistry (on-chain KYC) │
    │  CCTP Bridge (Circle)              │
    └────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| **Auth** | [Privy](https://privy.io) — email/SMS login, embedded wallet, no seed phrase required |
| **Smart Accounts** | ERC-4337 (ZeroDev), gasless transactions via Paymaster |
| **API Gateway** | Express.js, Pino logging, RFC 7807 error responses, per-partner rate limiting |
| **Database** | PostgreSQL 16 (ledger, KYC, remittance orders, card issuing) |
| **Queue / Cache** | Redis 7 |
| **Blockchain** | Arbitrum One (L2), ethers.js v5 |
| **Yield** | Aave V3, Morpho, Balancer — routed via StrategyRouter.sol |
| **Stablecoin** | USDC (native Arbitrum) |
| **Cross-chain** | Circle CCTP — USDC bridging to Ethereum / Base / Polygon / Optimism |
| **Card Issuing** | Stripe Issuing — physical + virtual debit cards |
| **Compliance** | On-chain ComplianceRegistry, Onfido KYC, Chainalysis screening |
| **Monorepo** | Turborepo |

---

## Live Contracts — Arbitrum One

| Contract | Address | Explorer |
|---|---|---|
| **GenesisVault** (ERC-4626) | `0xb6D0e996d795dCc65Dc21341DAf6FDE991e49abd` | [Arbiscan](https://arbiscan.io/address/0xb6D0e996d795dCc65Dc21341DAf6FDE991e49abd) |
| **StrategyRouter** | `0xD7ff8383eBBE3B1023d95A3f14c32D9941Ac9e84` | [Arbiscan](https://arbiscan.io/address/0xD7ff8383eBBE3B1023d95A3f14c32D9941Ac9e84) |
| **ComplianceRegistry** | `0x6D58678562387c400964737884E78f2f12e1c495` | [Arbiscan](https://arbiscan.io/address/0x6D58678562387c400964737884E78f2f12e1c495) |
| **USDC (native)** | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | [Arbiscan](https://arbiscan.io/address/0xaf88d065e77c8cC2239327C5EDb3A432268e5831) |

---

## Repository Structure

```
genesis-reserve/
├── apps/
│   ├── api/                   # Express API Gateway
│   │   ├── src/
│   │   │   ├── server.ts      # Entry point (port 4000)
│   │   │   ├── admin/         # Admin console service
│   │   │   ├── auth/          # Privy JWT + wallet identity
│   │   │   ├── config/        # DB pool, logger, event bus
│   │   │   ├── contracts/     # GenesisVault ABI
│   │   │   ├── cron/          # Yield harvest scheduler
│   │   │   ├── ledger/        # Transaction ledger service
│   │   │   ├── treasury/      # Vault ops, compliance, remittance
│   │   │   └── webhooks/      # Onfido, Chainalysis, ZeroHash
│   │   ├── db/migrations/     # 12 PostgreSQL migration files
│   │   ├── scripts/           # db-migrate, seed, emergency-drain
│   │   └── docker-compose.yml # Postgres 16 + Redis 7
│   │
│   └── web/                   # Next.js Frontend (port 3200)
│       └── src/
│           ├── app/api/gr/    # BFF routes (60+ endpoints)
│           ├── components/    # UI: wallet, deposit, yield, cards
│           ├── hooks/         # useGenesisVault, useCCTPTransfer, …
│           └── config/        # Privy, Wagmi, contract addresses
│
└── packages/
    └── types/                 # Shared TypeScript interfaces
```

---

## Quick Start

**Prerequisites:** Node 20+, Docker Desktop, Git

```bash
git clone https://github.com/TheGenesisArchitect/genesis-reserve.git
cd genesis-reserve
```

**Install dependencies:**
```bash
cd apps/api && npm install && cd ../..
cd apps/web && npm install && cd ../..
```

**Configure environment:**
```bash
# API — copy and fill in Alchemy key
cp apps/api/.env.example apps/api/.env

# Web — copy and fill in Alchemy + ZeroDev keys
cp apps/web/.env.example apps/web/.env.local
```

**Boot everything (requires Docker Desktop open):**
```powershell
# Windows
.\launch.ps1
```
```bash
# macOS / Linux
cd apps/api && ./start-dev.sh   # terminal 1
cd apps/web && npm run dev      # terminal 2
```

**Verify:**
- API health: `http://localhost:4000/health`
- Frontend: `http://localhost:3200`
- Admin: `curl -H "x-admin-key: genesis-admin-dev-2026" http://localhost:4000/admin/stats`

---

## API Overview

The Express gateway at `apps/api` exposes a REST API consumed by the Next.js BFF layer. All state-changing endpoints require an `Idempotency-Key` header.

| Domain | Key Endpoints |
|---|---|
| **Health** | `GET /health` `GET /ready` |
| **Treasury** | `POST /deposit` `POST /withdraw` `GET /balance/:account` |
| **Yield** | `GET /yield/strategies` `GET /yield/accrued/:account` |
| **Remittance** | `POST /remittance/quote` `POST /remittance/order` |
| **Compliance** | `GET /compliance/:wallet` `POST /compliance/screen` |
| **Admin** | `GET /admin/stats` `GET /admin/users` `GET /admin/queue` |

Authentication: `x-api-key` (partners) · `x-admin-key` (operators) · `Authorization: Bearer <privy-jwt>` (users)

---

## Key Engineering Decisions

**Why Arbitrum One?** Sub-cent gas fees make micro-yield distributions economically viable. USDC is native (not bridged), eliminating bridge risk on the core asset.

**Why ERC-4626?** The tokenized vault standard gives institutional integrators a standard interface and simplifies yield accounting — every share redemption is an atomic, auditable event.

**Why Privy over MetaMask?** Embedded wallets with email/SMS login removes the single biggest onboarding drop-off: "I don't have a crypto wallet." Users never see a seed phrase or pay gas.

**Why Circle CCTP over generic bridges?** CCTP burns and re-mints native USDC — there is no bridge-custodied liquidity pool that can be drained, and Circle provides the attestation service for free.

---

## Roadmap

- [x] Smart contracts deployed (Arbitrum One mainnet)
- [x] Full API gateway with DB, KYC, ledger, remittance
- [x] Privy embedded wallet + ERC-4337 smart accounts
- [x] Stripe debit card issuing
- [x] Circle CCTP cross-chain transfers
- [x] Turborepo monorepo restructure
- [ ] Admin operator console (live DB data)
- [ ] First user deposit → yield → withdrawal flow
- [ ] ZeroDev paymaster (gasless UX)
- [ ] Mobile PWA
- [ ] Institutional API partner onboarding

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All PRs require:
- TypeScript strict mode passing (`npm run typecheck`)
- No new `any` types without justification
- Idempotency-Key on all state-changing API calls

---

## Security

For responsible disclosure, see [SECURITY.md](SECURITY.md).  
**Never commit private keys or `.env` files.** The `.gitignore` blocks all env files at every level.

---

## License

MIT — see [LICENSE](LICENSE)

---

<div align="center">
  <sub>Built by <a href="https://github.com/TheGenesisArchitect">TheGenesisArchitect</a> · Genesis Trust Group</sub>
</div>
