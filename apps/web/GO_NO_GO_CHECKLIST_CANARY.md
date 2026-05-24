# Genesis Reserve — Canary Launch Go/No-Go Checklist

**Version**: 1.0-CANARY  
**Date**: March 26, 2026  
**Canary Scope**: Partner 1 only (Partner 2 on hold — see Phase 2 trigger below)  
**Decision Window**: T-48h to T-0 (Target T-0 = **April 29, 2026 09:00 ET**)  
**Authority**: Engineering + Product + Compliance (all required)

> **⚠ CANARY CONSTRAINTS — HARDCODED FOR THIS LAUNCH**
>
> | Constraint | Value | Enforcement |
> |---|---|---|
> | Active partners | Partner 1 only | `partner_feature_flags` → `partner_id = 'partner_1'`, `enabled = true` |
> | Partner 2 unlock | 24h after Partner 1 stable (per Phase 2 trigger below) | Separate GO/NO-GO gate |
> | Per-user send cap | **$10,000 USD** | `AUD` auditGate + on-chain `depositCap` enforced in GenesisVault |
> | Aggregate AUM cap | **$10M USD** | `AUD[Audit Gate AUM cap <= $10M]` node — hard halt |
> | MoneyGram corridor | DEMO gate enforced — real users blocked from send flow | `DEMO[Demo Guard]` middleware active |
> | On-chain network | Arbitrum One (chainId 42161) | RPC: `ALCHEMY_ARB_MAINNET` |

---

## Rule of Use

- **GO** requires all **P0** gates green with no unresolved critical incident.
- Any failed **P0** gate is automatic **NO-GO**. Escalate to Engineering Lead immediately.
- **P1** failures require written exception signed by Engineering + Product Lead + deadline.
- Canary success threshold: **0 P0 incidents + error rate < 2% sustained over 24h** → Phase 2 approval.

---

## P0 Launch Gates — Canary (Must Pass)

| Gate | Pass Criteria | Evidence Required | Owner | Target Date | Status |
|---|---|---|---|---|---|
| BFF Aggregate Layer Live | All 7 endpoints operational and returning correct payloads for partner_1 test accounts | Endpoint smoke report + response fixtures | Frontend Eng | April 25, 2026 | ☐ |
| Feature Flag: partner_1 only | `partner_feature_flags` row: `partner_id='partner_1'`, `enabled=true`; all other partners `enabled=false` | `SELECT partner_id, enabled FROM partner_feature_flags;` output | Backend Eng | April 25, 2026 | ☐ |
| Account Ownership Guard | Cross-account 403 verified for 3 test-user pairs across partner_1 | Auth test case output (3/3 pass) | Backend Eng | April 26, 2026 | ☐ |
| MoneyGram DEMO Gate Active | `DEMO Guard` middleware blocks any real-user send attempt; stub still in place; stub logs `DEMO_BLOCKED` | Middleware test + log sample | Backend Eng + Compliance | April 26, 2026 | ☐ |
| Euler eVault Verification | `cast call 0x797DD80692... "asset()" --rpc-url $ALCHEMY_ARB_MAINNET` returns USDC (`0xA0b86991c6218b36c1d19D4...`) | Cast output + tx hash | Smart Contract Eng | April 24, 2026 | ☐ |
| Per-user $10k Cap Enforced | Attempt to exceed $10,000 deposit/send is rejected with `CAP_EXCEEDED` error | QA test case + API response log | Backend Eng | April 26, 2026 | ☐ |
| AUM Hard Cap ≤ $10M | On-chain `totalAssets()` < $10M and GenesisVault `depositCap` enforced | Contract read + depositCap verification | Smart Contract Eng | April 27, 2026 | ☐ |
| Healthchecks Green (60 min) | API, BFF, Postgres, Redis, Kafka, harvest cron all healthy for 60 continuous minutes | Health dashboard screenshot + uptime log | DevOps | April 28, 2026 | ☐ |

---

## P1 Readiness Gates — Canary (Should Pass)

| Gate | Target | Evidence | Owner | Target Date | Status |
|---|---|---|---|---|---|
| Load Test (Canary Scale) | 250 concurrent users (canary slice), P95 < 500ms, error < 1% over 15 min | k6 report | DevOps | April 27, 2026 | ☐ |
| Security Scan | OWASP pass for partner_1 endpoints; zero critical CVEs in BFF | Scan report | Security | April 25, 2026 | ☐ |
| Reconciliation | Delta < $0.01 against on-chain `totalAssets()` for partner_1 test transfers | Reconciliation service log | Ops | April 27, 2026 | ☐ |
| Notifications | Yield + events appear in app within 60s for partner_1 test accounts | Notification QA run log | Full-stack | April 26, 2026 | ☐ |
| Partner 1 Admin Baseline | Partner 1 Admin can view user list, balances, and feature flag state in admin console | Partner 1 UAT sign-off | Product | April 28, 2026 | ☐ |
| PgBouncer in docker-compose | PgBouncer container running and proxying API → Postgres; connection pool verified | `docker ps` + pgbouncer log | DevOps | April 25, 2026 | ☐ |

## Expanded MVP Scope Gates — Canary Readiness

| Feature | Canary/Launch Pass Criteria | Evidence | Owner | Target Date | Status |
|---|---|---|---|---|---|
| Advanced Analytics | ROI, yield-by-strategy, and risk heatmap views available for Partner 1 users/admin | Partner 1 UAT + screenshots | Frontend + Product | April 28, 2026 | ☐ |
| Scheduled Sends | Recurring remittance (create/edit/cancel) works for Partner 1 | E2E test log | Backend + Frontend | April 27, 2026 | ☐ |
| Batch Operations | Multi-recipient send flow succeeds with correct per-recipient ledger entries | Batch test report | Backend Eng | April 27, 2026 | ☐ |
| Invoicing | Invoice/payment request generation + settlement linkage operational | UAT report | Product + Backend | April 28, 2026 | ☐ |
| Mobile Apps (iOS/Android) | Native app can sign in, view balances, and execute send flow for Partner 1 | Mobile smoke report | Mobile Eng | April 28, 2026 | ☐ |
| API for Partners | Partner API endpoints for Partner 1 are live, authenticated, and rate-limited | API smoke + OpenAPI snapshot | Backend Eng | April 27, 2026 | ☐ |
| White-Labeling | Partner 1 branding config resolves correctly across web and mobile surfaces | Visual QA checklist | Frontend Eng | April 28, 2026 | ☐ |
| Yield Strategy Selection | Conservative/Balanced/Growth selection persists and routes allocations correctly | Integration test output | Smart Contract + Backend | April 27, 2026 | ☐ |
| Audit Logs | Admin actions for Partner 1 captured with actor/time/action/resource metadata | Audit query samples | Backend + Compliance | April 27, 2026 | ☐ |

---

## Canary KPI Thresholds (Locked)

| Metric | Definition | Canary Threshold | Escalate If |
|---|---|---|---|
| `server_error_rate` | 5xx / total requests | < 1.0% | > 1.0% for 5 consecutive minutes |
| `client_error_rate` | 4xx / total requests | monitor-only | > 10% spike — investigate |
| `payment_failure_rate` | provider failures / payment attempts | < 0.5% | > 0.5% — halt MoneyGram stub immediately |
| `vault_health` | harvest cron last-success age | < 20 min | > 20 min — PagerDuty P1 |
| `reconciliation_delta` | on-chain vs ledger delta | < $0.01 | any $1.00+ discrepancy — halt |
| `compliance_block_rate` | KYC/AML denies / screens | monitor-only | > 30% — compliance review |

---

## Canary Observation Window & Phase 2 Trigger

**Partner 1 Observation Window**: **24 hours** starting at T-0 (April 29, 2026 09:00 ET)

**Phase 2 Unlock (Partner 2) Requires ALL of the following:**

- [ ] Zero P0 incidents during the 24h window
- [ ] `server_error_rate` sustained < 2% for the full window
- [ ] `reconciliation_delta` < $0.01 at T+24h snapshot
- [ ] No vault harvest missed or delayed > 20 min
- [ ] Expanded MVP Scope Gates all green or explicitly waived in writing by Engineering + Product + Compliance
- [ ] Engineering Lead + Compliance Lead co-sign Phase 2 approval form

**Partner 2 Canary Target**: April 30, 2026 09:00 ET (T+24h if Partner 1 stable)

---

## Rollback Readiness (Required Before GO)

| Action | Verified | Owner |
|---|---|---|
| Partner 1 feature flag kill switch tested (set `enabled=false` → BFF immediately rejects) | ☐ | Backend Eng |
| Send-flow disable switch tested (DEMO guard → all sends return `SERVICE_UNAVAILABLE`) | ☐ | Backend Eng |
| Emergency on-chain pause: `GUARDIAN_ROLE` holder on-call + `pause()` call tested on testnet | ☐ | Smart Contract Eng |
| Deploy rollback runbook tested — previous Docker image re-tagged and deployed | ☐ | DevOps |
| Reservation cancel path tested — open reservations cancelled without ledger leak | ☐ | Backend Eng |
| PagerDuty schedule active — P0 response < 30 min; escalation chain confirmed | ☐ | DevOps |
| Incident Slack channel (`#genesis-incidents`) active with all rotation members | ☐ | Engineering Lead |

---

## Pre-Launch Checklist (T-48h Actions)

- [ ] Merge all BFF endpoint PRs to `main`; deployment pipeline green
- [ ] Run DB migration for `partner_feature_flags`, `notifications`, `audit_events` tables
- [ ] Seed `partner_feature_flags`: Partner 1 `enabled=true`, all others `false`
- [ ] Set `depositCap` on GenesisVault to `10_000_000e6` (USDC 6-decimal, $10M)
- [ ] Confirm Euler eVault address verification complete (P0 gate above)
- [ ] Send T-48h readiness email to Partner 1 POC
- [ ] Open post-mortem doc template in `docs/canary-launch-postmortem-APRIL29.md`
- [ ] Lock `main` branch — no merges without Engineering Lead approval during canary window

---

## Final Decision Block — CANARY

**Decision**: ☐ GO (Canary — Partner 1 only)  ☐ NO-GO  
**T-0 Date/Time**: April 29, 2026  09:00 ET  
**Canary AUM Cap**: $10M USD  
**Per-User Cap**: $10,000 USD

**Required Approvals**

| Role | Name | Signature | Date |
|---|---|---|---|
| Engineering Lead | ________________ | ________________ | ________ |
| Product Lead | ________________ | ________________ | ________ |
| Compliance Lead | ________________ | ________________ | ________ |
| Operations Lead | ________________ | ________________ | ________ |

**If NO-GO — Top 3 Blockers and ETAs**

1) ____________________________________________  ETA: ____________
2) ____________________________________________  ETA: ____________
3) ____________________________________________  ETA: ____________

---

## Phase 2 Decision Block — Partner 2 Unlock (Complete at T+24h)

**Observation Window End**: April 30, 2026  09:00 ET  
**Decision**: ☐ UNLOCK Partner 2  ☐ EXTEND Canary Window  ☐ HALT — Full Rollback

**Co-Signers** (required for unlock):

| Role | Name | Signature |
|---|---|---|
| Engineering Lead | ________________ | ________________ |
| Compliance Lead | ________________ | ________________ |

---

*This document is the authoritative canary launch gate for Genesis Reserve. Any deviation from the constraints in the ⚠ CANARY CONSTRAINTS table requires explicit written approval from all four leads.*  
*See [GO_NO_GO_CHECKLIST.md](GO_NO_GO_CHECKLIST.md) for the full-launch (10-partner) version.*  
*See [ARCHITECTURE_MVP_V2.md](ARCHITECTURE_MVP_V2.md) for the full system architecture and conditional approval status.*
