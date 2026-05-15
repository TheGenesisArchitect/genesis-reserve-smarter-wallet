# Security Policy

## Scope

This policy covers:
- **Smart contracts** (GenesisVault, StrategyRouter, ComplianceRegistry on Arbitrum One)
- **API Gateway** (`apps/api`) — authentication, authorization, input validation
- **Frontend** (`apps/web`) — wallet interaction, key handling, BFF routes

Out of scope: third-party protocols (Aave, Morpho, Privy, Circle) — report those to their respective teams.

## Supported Versions

| Component | Status |
|---|---|
| `apps/api` — latest `master` | Supported |
| `apps/web` — latest `master` | Supported |
| Smart contracts — deployed addresses | Supported (immutable; upgrade path via governance) |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email: **crownmcllc@gmail.com**  
Subject line: `[SECURITY] genesis-reserve — <brief description>`

Include:
1. Component affected (API / Web / Contract)
2. Steps to reproduce
3. Impact assessment (what an attacker can do)
4. Your suggested fix (optional but appreciated)

You will receive an acknowledgement within 48 hours and a resolution timeline within 7 days.

## Private Key Hygiene

- **Never** commit `.env` files — all env file patterns are in `.gitignore`
- Operator and relayer keys in `.env` are for local dev only — rotate before production
- The `COMPLIANCE_ADMIN_PRIVATE_KEY` has `DEFAULT_ADMIN_ROLE` on-chain — treat it like a root credential
