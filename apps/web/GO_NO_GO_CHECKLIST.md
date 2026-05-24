# Genesis Reserve Launch Go/No-Go Checklist (One-Page)

> **Canary (2-partner) pre-filled version**: See [GO_NO_GO_CHECKLIST_CANARY.md](GO_NO_GO_CHECKLIST_CANARY.md)

**Version**: 1.0  
**Date**: March 26, 2026  
**Decision Window**: T-48h to T-0  
**Authority**: Engineering + Product + Compliance (all required)

## Rule of Use

- **GO** requires all **P0** gates green and no unresolved critical incident.
- Any failed **P0** gate is automatic **NO-GO**.
- **P1** gate failures require written exception + rollback owner + deadline.

---

## P0 Launch Gates (Must Pass)

| Gate | Pass Criteria | Evidence | Owner | Status |
|---|---|---|---|---|
| BFF Aggregate Layer Live | All 7 endpoints operational (`/dashboard`, `/yield`, `/history`, `/send`, `/deposit`, `/notifications`, `/accounts`) | Endpoint smoke + test report | Frontend Eng | ☐ |
| Feature Flags Active | `partner_feature_flags` enabled and resolved at BFF session init | DB rows + middleware log sample | Backend Eng | ☐ |
| Account Ownership Guard | Cross-account access attempt returns 403 consistently | Auth test case output | Backend Eng | ☐ |
| MoneyGram Stub Removed (or hard DEMO gate) | Real provider integration active for launch corridor **or** real users blocked from stub flow | Provider callback logs + policy check | Backend Eng + Compliance | ☐ |
| Euler eVault Verification Complete | Deploy pipeline + contract metadata verification confirmed | Verification transaction/proof | Smart Contract Eng | ☐ |
| Healthchecks Green | API, BFF, DB, Redis, Kafka, cron all healthy for continuous 60 min | Health dashboard snapshot | DevOps | ☐ |

---

## P1 Readiness Gates (Should Pass)

| Gate | Target | Evidence | Owner | Status |
|---|---|---|---|---|
| Load Test | 1,000 concurrent, 30 min; P95 < 500ms, error < 1% | Load report | DevOps | ☐ |
| Security Scan | OWASP pass, zero critical CVEs | Security report | Security | ☐ |
| Reconciliation | Delta < $0.01 against on-chain totalAssets | Reconciliation logs | Ops | ☐ |
| Notifications | Yield + remittance events visible in app within 60s | Notification QA run | Full-stack | ☐ |
| Partner Admin Baseline | Users + Overview + Feature flags operational for launch partners | Admin UAT sign-off | Product | ☐ |

## Expanded MVP Scope Gates (Now In Scope for Launch)

| Feature | Launch Pass Criteria | Evidence | Owner | Status |
|---|---|---|---|---|
| Advanced Analytics | ROI, yield-by-strategy, and risk heatmap views available to launch partners | Product QA + screenshots | Frontend + Product | ☐ |
| Scheduled Sends | Recurring remittance create/edit/cancel works with idempotency protection | Integration test output | Backend + Frontend | ☐ |
| Batch Operations | Multi-recipient send flow executes and records atomic ledger entries | Batch E2E report | Backend Eng | ☐ |
| Invoicing | Payment request generation and status tracking functional | UAT + API response samples | Product + Backend | ☐ |
| Mobile Apps (iOS/Android) | Native app builds can authenticate, view balance, and submit send flow in production env | Mobile smoke report | Mobile Eng | ☐ |
| API for Partners | Programmatic partner endpoints documented, authenticated, rate-limited, and live | OpenAPI + smoke report | Backend Eng | ☐ |
| White-Labeling | Per-partner branding (name/logo/theme config) resolves correctly at runtime | Partner UAT sign-off | Frontend Eng | ☐ |
| Yield Strategy Selection | Conservative/Balanced/Growth selection persists and influences allocation path | Strategy selection test report | Smart Contract + Backend | ☐ |
| Audit Logs | Admin actions captured with actor, timestamp, action, and resource metadata | Audit log query samples | Backend + Compliance | ☐ |

---

## P0 Protocol Degradation Gates (Phase 2 — Must Pass Before Yield Rollout)

> **Decision**: Launch criteria updated from "visible protocols" to **"correct degradation behavior under failure mode"**.  
> All three scenarios must pass `npm run test:phase2` (27/27 green) and be verified in staging.

| Gate | Negative-path scenario | Expected degradation | Evidence | Status |
|---|---|---|---|---|
| Maple Accreditation Block | Non-accredited wallet submits deposit to Maple pool | BFF returns 403 with `accreditation_required`; Maple excluded from all tier ranked outputs; `suppressed_accreditation_required` in diagnostics | `test:phase2` pass + staging deposit attempt log | ☐ |
| Pendle Near-Expiry Block | Pendle PT strategy with <30 days to expiry enters pool | Strategy suppressed from recommendations; `yieldLockWarning: true` shown in strategy detail; `suppressed_maturity_too_near` in diagnostics | `test:phase2` pass + VaultsPage warning UI screenshot | ☐ |
| Ethena APY Ceiling Breach | Ethena strategy reported with APY >30% (inversion/spike) | Strategy suppressed before ranking; `suppressed_apy_ceiling` in diagnostics; ceiling detail message includes threshold | `test:phase2` pass + yield/monitor diagnostics log | ☐ |
| Cross-Protocol Pool Integrity | Mixed pool with all three suppressed protocols + healthy alternatives | Zero suppressed strategies in any tier ranked output; healthy strategies (Aave/Morpho) unaffected | `test:phase2` cross-protocol suite pass | ☐ |
| strategyId Identity Under Suppression | Pendle/Maple/Ethena/Aave/Morpho IDs through normalization pipeline | strategyId unchanged post-normalization; no legacy alias substitution | `test:phase2` identity suite pass | ☐ |

### Automated Gate Command

```bash
npm run test:phase2
# Expected: 27 passed (27)
```

### Staging Manual Verification Checklist

- [ ] Attempt deposit to Maple pool with non-accredited test wallet → expect 403 screen in DepositFlow
- [ ] Load Vault Desk with Pendle near-expiry strategy → expect orange maturity warning banner in strategy drill-down
- [ ] Inject Ethena strategy at 28% APY into staging deframe feed → confirm absent from `/api/gr/vault/strategies` ranked output
- [ ] Check `/api/gr/yield/monitor` response for `rejectedByReason` diagnostic field


---

## KPI Definition Lock (No Ambiguity)

| Metric | Definition | Threshold |
|---|---|---|
| `server_error_rate` | 5xx / total requests | < 1.0% |
| `client_error_rate` | 4xx / total requests | monitor-only |
| `compliance_block_rate` | compliance denies / screens | monitor-only |
| `payment_failure_rate` | provider failures / payment attempts | < 0.5% |

---

## Rollback Readiness (Required Before GO)

- Kill switches verified: partner feature flags + send-flow disable.
- Emergency on-chain pause path verified (`GUARDIAN_ROLE`) and owner on-call.
- Runbooks tested: deploy rollback, reservation cancel path, incident escalation.
- PagerDuty schedule active with <30 min P0 response objective.

---

## Final Decision Block

**Decision**: ☐ GO  ☐ NO-GO  
**Date/Time**: ____________________  
**Scope**: ☐ Canary (2 partners)  ☐ Full (10 partners)

**Required Approvals**

- Engineering Lead: ____________________
- Product Lead: ____________________
- Compliance Lead: ____________________
- Operations Lead: ____________________

**If NO-GO, Top 3 blockers and ETA**

1) ____________________________________________
2) ____________________________________________
3) ____________________________________________
