# Genesis Reserve Dashboard — MVP Launch Scope
**Version**: 1.1  
**Date**: April 23, 2026  
**Status**: In Implementation

> **Architecture Companion (v2 Corrected)**: See `ARCHITECTURE_MVP_V2.md` for the interactive system diagram and implementation contract aligned to the senior engineering review.
>
> **Final Launch Decision Sheet**: See `GO_NO_GO_CHECKLIST.md` for one-page sign-off gates and approval workflow.

---

## 1. Executive Summary

**Genesis Reserve Dashboard** is a user-first mobile wallet and treasury routing experience. The MVP launch prioritizes fast onboarding, trusted balance visibility, reliable send/deposit flows, and clear treasury-backed value for end users while preserving partner and enterprise surfaces as secondary rollout tracks.

**Launch Window**: Q2 2026  
**Target SLA**: 99.5% uptime, <500ms median latency, <1% error rate  
**Scale**: 10k users, 100k+ monthly transactions, 10 pilot partners enabled post-wallet stability

### 1.1 Architecture Boundary (Locked)
- **Privy** is the primary wallet access layer for auth, sessions, embedded wallet UX, and signing.
- **Genesis** is the control plane for ledger, policy, treasury routing, orchestration, and account mapping.
- **Regulated provider rails** remain backend-only under Genesis orchestration.
- **MetaMask compatibility** is optional for advanced and operator workflows, not the primary consumer path.

### 1.2 Implementation Priority Rule
Any feature that does not improve wallet adoption, flow completion, trust signals, compliance-safe execution, or launch reliability is moved to post-launch unless it unblocks a launch-critical dependency.

---

## 2. MVP Feature Set (Launch Day)

### 2.1 Authentication & Account Management
- **Privy Wallet Integration**: embedded wallet-first onboarding for end users
- **External Wallet Compatibility**: optional connect path for advanced users/operators
- **Partner Admin Console**: limited launch scope; only launch blockers in MVP
- **KYC Tiers**: BASIC (immediate), ENHANCED (verified), INSTITUTIONAL (premium limits)
- **Session Management**: secure token refresh, logout, re-auth on sensitive ops
- **Multi-Account Support**: 1 user → multiple linked treasury accounts (Business, Personal, etc.)

### 2.2 Dashboard Home
- **Account Summary Card**: 
  - Total Balance (available + reserved + routed)
  - YTD Yield accrued
  - KYC tier and compliance status
  - Quick-action buttons (Send, Deposit, Withdraw)
- **Account Switcher**: dropdown to select between user's linked treasury accounts
- **Portfolio Allocation**: pie chart (Liquid %, Reserved %, Invested/Yield-bearing %)
- **Treasury Routing Visibility**:
  - Active routing mode (liquidity, yield, mixed)
  - Liquidity confidence indicator
  - Estimated time-to-available for outbound send
- **Alerts & Notifications**: pending compliance holds, low balance warnings, transaction notifications

### 2.3 Send Flow (Remittance)
- **Send Page**:
  - Recipient selector (recent + add new)
  - Amount input with currency pair (USDC → PHP, MXN, INR, others)
  - Corridor selection (auto-populated based on recipient country)
  - Payout method selector (bank transfer, mobile money, cash pickup)
  - FX quote display (rate, spread, estimated receive), valid 5 minutes
  - Submit order with Idempotency-Key protection
  - Confirmation screen with TxID + next steps
- **Status Monitoring**:
  - Order tracking by TxID
  - Real-time status: PENDING → IN_TRANSIT → SETTLED / FAILED
  - Estimated delivery time + actual settlement timestamp
  - Recipient notification status (email/SMS if configured)

### 2.4 History & Ledger
- **Transaction History**:
  - Filterable table (date, amount, status, recipient, corridor)
  - Pagination (20 rows/page, load more)
  - Export to CSV for accountants (full audit trail)
  - Sort by: date (desc), amount, status
- **Detailed Transaction View**:
  - Full remittance details (quote, FX rate, all fees broken down)
  - On-chain TX hash (for deposited/reserved amounts)
  - Compliance screening result
  - Travel rule submission status (if applicable)

### 2.5 Compliance & Risk
- **Compliance Status Widget**:
  - Current KYC tier + expiry
  - Sanctioned list screening status (Chainalysis)
  - Pending reviews or holds (if any)
  - Travel rule obligations (if applicable, >$3k)
- **Read-Only Compliance Info**:
  - Country restrictions + corridor whitelist
  - Daily/weekly/annual limits by tier
  - AML/sanctions screening results (reference only)

### 2.6 Account Settings (Minimal MVP)
- **Profile**:
  - Display name, email, phone
  - KYC tier and verification date
  - Linked wallet address(es)
- **Preferences**:
  - Notification settings (email, SMS, push)
  - Preferred currency display
  - Time zone
- **Security**:
  - Session management (view active sessions, logout all)
  - Login history (new device alerts)
  - No password change (Privy handles auth)

### 2.7 API & Infrastructure (BFF + Backend)
- **BFF Proxy Layer** (Next.js `/api/gr/*`):
  - Transparent passthrough to backend
  - Error body + status forwarding
  - Request/response validation
  - Rate limiting (per partner)
  - Idempotency key validation
- **Backend API** (`/v1/` routes):
  - Authentication (x-api-key for partners, JWT for users)
  - Treasury operations (balance, reserve, finalize)
  - Remittance (quote, order, status)
  - Ledger (entries, export)
  - Compliance (screening, status, travel rule)
- **Database**:
  - PostgreSQL (accounts, ledger, idempotency, partners, compliance)
  - Redis (session cache, quote cache)
  - Kafka (event stream for reconciliation/harvest)
- **On-Chain** (Arbitrum Sepolia testnet for MVP; prod → Arbitrum One):
  - GenesisVault (ERC-4626 yield-bearing contract)
  - USDC (Circle canonical)
  - Compliance Registry (on-chain screening status)

### 2.8 Expanded MVP Features (Now In Scope)
- **Advanced Analytics**: ROI tracking, yield breakdowns by strategy, risk heatmaps
- **Scheduled Sends**: recurring remittance setup
- **Batch Operations**: multi-recipient sends in a single action
- **Invoicing**: generate payment requests for payroll
- **Mobile Apps**: native iOS/Android clients
- **API for Partners**: programmatic access to dashboard data/operations
- **White-Labeling**: custom branding per partner (Privy + Genesis theme)
- **Yield Strategy Selection**: users choose Conservative/Balanced/Growth allocations
- **Audit Logs**: detailed admin logging beyond basic history

### 2.9 Launch-Critical UX Constraints
- Core wallet actions (open app, view balance, deposit, send, view history) should be reachable in <=3 taps each on mobile layouts.
- Every high-risk or delayed action must expose a visible status and next-step message.
- Critical flow states (pending, failed, settled) must be reflected in-app within one refresh interval.
- MVP UX language should remain fintech-simple and avoid crypto jargon in primary user flows.

---

## 3. Non-MVP Features (Post-Launch Backlog)

The following features remain **out of scope** for launch and are prioritized post-launch based on partner feedback:

- **Advanced Compliance**: biometric verification, video KYC, sanctions list integration beyond Chainalysis
- **Multi-Currency Accounts**: USDC only for MVP; EUR/GBP/JPY later
- **Webhook Notifications**: server-to-server event delivery
- **Deep Partner White-Labeling**: advanced branding and per-partner custom journey variants
- **Non-launch-critical enterprise workflow automation**: broader operations tooling not tied to wallet launch metrics

---

## 4. Success Metrics & KPIs

### 4.1 Availability & Performance
| Metric | Target | Acceptable Range |
|--------|--------|------------------|
| Uptime (SLA) | 99.5% | ≥99.0% |
| P50 Latency | <200ms | <500ms |
| P99 Latency | <1000ms | <2000ms |
| Error Rate | <1% | <3% |
| Quote Request Latency | <300ms | <1000ms |
| Order Submit P99 | <2000ms | <5000ms |

### 4.2 User Adoption
| Metric | Target (Month 1) | Target (Q2) |
|--------|------------------|------------|
| Active Partners | 10 | 10 |
| Active Users | 2,000 | 10,000 |
| Daily Active Users (DAU) | 300 | 1,500 |
| Weekly Send Volume | 500 | 5,000 |
| Conversion Rate (Quote → Order) | ≥70% | ≥75% |

### 4.3 Financial
| Metric | Target |
|--------|--------|
| Avg Send Amount | $500–$2,000 |
| Monthly Transaction Volume | $50M–$100M |
| Fee Revenue (annualized) | $600k–$1.2M |
| Cost per Transaction | <$0.50 |

### 4.4 Quality & Reliability
| Metric | Target |
|--------|--------|
| Compliance Block Rate | <5% of orders |
| Failed Delivery Rate | <1% of settled orders |
| Support Ticket Response Time | <4h (business hours) |
| Rollback Frequency | 0 in first 30 days |

---

## 5. Launch Constraints & Assumptions

### 5.1 Technical Constraints
- **Browser Support**: Chrome, Firefox, Safari, Edge (latest 2 versions)
- **Mobile**: responsive design (not native app)
- **Localization**: English only for MVP (FR, ES, DE post-launch)
- **Currencies**: USDC only (no multi-chain; Arbitrum One mainnet only)
- **Corridors**: US→PH, US→MX, US→IN, GB→NG (4 corridors initial)
- **Data Residency**: data stored in US (GDPR compliance TBD post-launch)

### 5.2 Operational Constraints
- **Partner Onboarding**: manual setup by Genesis team (no self-serve)
- **Support Channel**: email + in-app support form (no phone/chat for MVP)
- **Maintenance Window**: weekly deployments Tuesday 2–3am UTC
- **Incident Response**: <30min triage, <2h resolution SLA for P1 issues

### 5.3 Compliance & Legal
- **KYC/AML**: Onfido + Chainalysis integration required before send
- **Travel Rule**: TRISA protocol compliance for >$3k orders
- **Sanctions**: real-time screening on every order (no caching)
- **Audit Trail**: 7-year transaction log retention (immutable ledger)
- **Terms of Service**: partner acceptance required before launch (legal review complete)

### 5.4 Assumptions
- Partners have provided: API keys, KYC tier definitions, rate card
- Onfido + Chainalysis APIs are available and tested
- Arbitrum One mainnet is stable (no L2 downtime >1h expected)
- Partner marketing/communication is in place (Genesis doesn't own user acquisition)
- Minimum 2 partner goes live in Week 1, remaining 8 follow by Week 4

---

## 6. Out-of-Pocket Operational Costs (Monthly)

| Component | Cost | Notes |
|-----------|------|-------|
| Infrastructure (cloud compute, DB) | $15k–$25k | auto-scales to 10k users |
| Compliance APIs (Onfido, Chainalysis) | $5k–$10k | per 10k screenings |
| On-Chain Gas Fees (Arbitrum) | $500–$2k | minimal; L2 is low-cost |
| Monitoring & Logging (Datadog) | $2k–$5k | observability stack |
| CDN & Security (Cloudflare) | $1k–$2k | DDoS, WAF, caching |
| Support & Incident Response | $3k–$5k | on-call ops team |
| **Total** | **~$27k–$49k** | scales with volume |

---

## 7. Go/No-Go Launch Checklist

**All items must be GREEN by launch day.**

### Pre-Launch (T-2 weeks)
- [ ] All MVP features implemented and code-reviewed
- [ ] BFF + backend integration tested end-to-end
- [ ] Smoke tests passing (quote → order → finalize flow)
- [ ] Database migrations tested on staging
- [ ] Compliance APIs (Onfido, Chainalysis) integrated & verified
- [ ] Load test: 1,000 concurrent users, <500ms P95 latency
- [ ] Security scan: OWASP Top 10 pass, no critical CVEs
- [ ] Runbooks drafted: deployment, incident response, rollback
- [ ] Partner support playbook reviewed and signed off
- [ ] Legal: ToS, privacy policy finalized

### Launch Day (T-0)
- [ ] All team members on standby (on-call rotation)
- [ ] Monitoring dashboards live (Datadog, alert rules configured)
- [ ] Incident channel open (#genesis-launch-war-room)
- [ ] Feature flags deployed (enable feature per partner ID)
- [ ] Database backup taken
- [ ] Healthchecks: API, frontend, database, Kafka all green
- [ ] First partner's users invited to staging
- [ ] 2 test transactions completed end-to-end
- [ ] Launch announcement sent (email, Slack)

### Post-Launch (T+72h)
- [ ] Zero critical incidents
- [ ] Error rate <1.5%
- [ ] All partners onboarded
- [ ] Minimum 100 transactions settled
- [ ] Partner feedback collected
- [ ] Post-launch review & retrospective scheduled

---

## 8. Definition of Done (per Feature)

A feature is shipped when:
1. **Code**: merged to `main`, peer-reviewed, linted, no TypeScript errors
2. **Tests**: unit + integration tests passing, >80% coverage (API), BFF passthrough tests green
3. **Docs**: API docs updated, user guide drafted, runbook created
4. **QA**: tested on staging, smoke tests pass, edge cases handled (network errors, timeouts, race conditions)
5. **Performance**: P99 latency <target, no memory leaks, stress-tested
6. **Security**: no sensitive data in logs, inputs validated, SQL injection/XSS mitigated
7. **Monitoring**: alerts wired, metrics dashboarded, error tracking enabled
8. **Sign-Off**: product owner + engineering lead approved

---

## 9. Communication & Decision Authority

| Decision | Owner | Approval |
|----------|-------|----------|
| Feature scope changes | Product | CEO + CTO |
| Launch date slip | CTO | CEO |
| Partner onboarding pace | Operations | Product |
| Incident severity escalation | On-call Eng | CTO |
| Post-launch backlog prioritization | Product | All partners |

---

## 10. Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Partner API integration delays | HIGH | HIGH | Pre-integration testing + API mocks |
| Compliance screening latency | MEDIUM | MEDIUM | Caching + fallback logic |
| On-chain contract bugs | LOW | CRITICAL | Formal audit complete, mainnet TBD |
| User adoption slower than forecast | MEDIUM | MEDIUM | Feature flags allow phased rollout |
| Compliance hold > 24h | LOW | MEDIUM | Dedicated support tier for holds |
| Data loss / corruption | LOW | CRITICAL | automated snapshots, geo-replication |

---

## 11. Success Criteria (Post-Launch Review)

**Launch is successful if, by end of Week 1:**
- ✅ Zero critical incidents (P0)
- ✅ ≥95% uptime
- ✅ >1,000 transactions initiated
- ✅ ≥2 partners active with real users
- ✅ Error rate <2%
- ✅ Quote-to-order conversion >60%
- ✅ Partner NPS score ≥7/10

If any criteria are red, launch is paused and root causes addressed before resuming.

---

## 12. Appendix: Glossary

| Term | Definition |
|------|-----------|
| **MVP** | Minimum Viable Product — launch-day feature set |
| **BFF** | Backend-for-Frontend — Next.js proxy layer |
| **Corridor** | origin country → destination country remittance route |
| **Idempotency** | guarantee that duplicate requests result in same outcome |
| **SLA** | Service Level Agreement uptime target |
| **KYC Tier** | Know-Your-Customer risk classification (BASIC, ENHANCED, INSTITUTIONAL) |
| **Travel Rule** | compliance requirement for >$3k international transfers |
| **Yield** | interest/farming rewards earned on reserves |
| **USDC** | USD Coin stablecoin (Circle) |
| **Arbitrum** | Ethereum Layer 2 scaling solution |

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product Owner | TBD | — | — |
| CTO | TBD | — | — |
| CEO | TBD | — | — |
| Compliance | TBD | — | — |
| Operations | TBD | — | — |

---

**Document Version History**
- v1.0 (Mar 26, 2026): Initial draft for stakeholder review

**Next Review**: April 2, 2026 (post-stakeholder feedback)
