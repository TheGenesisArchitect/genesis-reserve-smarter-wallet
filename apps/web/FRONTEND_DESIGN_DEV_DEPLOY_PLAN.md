# Genesis Reserve Frontend Plan — Design, Development, Deployment

**Version**: 1.0  
**Date**: March 26, 2026  
**Scope**: Launch-ready frontend plan aligned to `LAUNCH_MVP_SCOPE.md`, `ARCHITECTURE_MVP_V2.md`, `GO_NO_GO_CHECKLIST.md`, and `GO_NO_GO_CHECKLIST_CANARY.md`

---

## 1) Objectives

- Deliver a production-ready frontend for Genesis Reserve launch and canary operations.
- Implement all launch-day MVP features, including newly promoted scope:
  - Advanced Analytics
  - Scheduled Sends
  - Batch Operations
  - Invoicing
  - Mobile Apps (iOS/Android)
  - API for Partners (frontend integration + docs UX)
  - White-Labeling
  - Yield Strategy Selection
  - Audit Logs (admin visibility)
- Preserve architecture controls: BFF-first aggregation, feature flags, ownership guard, and demo gating for any stubbed corridor.

---

## 2) Frontend Architecture Targets

### 2.1 Platform Split

- **Web App**: Next.js 14 (App Router) at `src/app/*`
- **BFF Layer**: Next.js API routes at `src/app/api/gr/*`
- **State + Data**: React Query + scoped Zustand where needed
- **Auth**: Privy (session + wallet)
- **Wallet/Web3**: wagmi + viem + ZeroDev account abstraction
- **Styling**: existing Tailwind tokens + current design primitives only

### 2.2 Deployment Surfaces

- **Canary Web**: Partner-flagged route exposure (Partner 1 first)
- **Full Web**: 10-partner rollout after canary gate pass
- **Mobile**: native iOS/Android release tracks (partner-gated features)

### 2.3 Non-Negotiable Controls

- Route-level account ownership validation on all account-scoped screens.
- Partner feature flag check at app boot and route guard layers.
- MoneyGram real-user access remains blocked unless provider readiness gate is green.
- Idempotency enforcement for all submit-style flows (send, scheduled send, batch send, invoicing actions).

---

## 3) UX/Design Workstream (Week 1–2)

## 3.1 Information Architecture

Primary web navigation:

1. Dashboard
2. Send
3. History
4. Analytics
5. Invoicing
6. Admin (partner-scoped)
7. Settings

Mobile tab set (MVP):

1. Home
2. Send
3. History
4. Alerts
5. Settings

### 3.2 Screen Inventory

- **Dashboard**: balances, yield snapshot, compliance state, alerts, account switcher
- **Send**: quote, recipient, corridor, payout, idempotent submit, status tracking
- **History**: filters, CSV export, transaction details
- **Analytics**: ROI trend, strategy breakdown, risk heatmap
- **Scheduled Sends**: create/edit/pause/cancel recurring remittances
- **Batch Operations**: upload/create multi-recipient batch + execution results
- **Invoicing**: issue invoice/payment request + status lifecycle
- **Yield Strategy Selection**: Conservative/Balanced/Growth selector + explanation
- **Audit Logs (Admin)**: actor/action/resource/time feed with filters
- **White-Labeling**: runtime theme/branding per partner without introducing new token set

### 3.3 Design Deliverables

- Wireframes for all launch screens (desktop + mobile)
- Component inventory mapped to reusable primitives
- Interaction specs for error/loading/empty states
- Accessibility checklist (keyboard, focus order, color contrast, semantic labels)

Exit criteria:

- Design review sign-off by Product + Engineering + Compliance where applicable
- No unresolved UX blockers on critical flows

---

## 4) Development Workstream (Week 2–5)

## 4.1 Feature Build Order

### Phase A — Core Stability (Week 2)

- Harden BFF proxy error forwarding and response validation
- Complete ownership guard checks across all account routes
- Ensure feature-flag bootstrap in layout/session init
- Add frontend telemetry envelope for all critical user actions

### Phase B — Core Launch Flows (Week 2–3)

- Dashboard + account switcher integration
- Send flow end-to-end wiring (quote → compliance → reserve/finalize)
- History + CSV export + transaction detail screen
- Notifications feed + in-app bell UX

### Phase C — Expanded MVP Features (Week 3–4)

- Analytics dashboards
- Scheduled sends lifecycle
- Batch operations UX + result handling
- Invoicing lifecycle UI
- Yield strategy selection UI + persistence path
- Partner-facing API docs/credentials UX (as frontend surface for API feature)
- Admin audit log views
- White-label runtime branding resolution

### Phase D — Mobile Readiness (Week 4–5)

- Native iOS/Android parity for: auth, dashboard, send, history, alerts
- Partner-gated feature rollout controls
- Mobile smoke tests in production-like env

## 4.2 Engineering Standards

- Every user-submission action includes idempotency key handling.
- Frontend types generated/validated against BFF contracts.
- Feature flags used instead of hard-coded partner conditionals.
- No direct backend calls from UI components when BFF path exists.

## 4.3 Testing Strategy

- **Unit**: component logic and utility behavior
- **Integration**: page + data hooks + BFF route interaction
- **E2E smoke**:
  - login
  - dashboard load
  - send success/failure
  - scheduled send create/cancel
  - batch operation submit
  - invoice create/settle state change
  - white-label render for partner_1
- **Regression**: canary gate suite before every release candidate

Required CI checks:

- `npm run lint`
- `npm run typecheck`
- `npm run test:bff-proxy`
- build validation (`npm run build`)

---

## 5) Deployment Workstream (Week 5–6)

## 5.1 Environment Strategy

- **dev**: active feature development
- **staging**: integration with backend + chain test flows
- **preprod/canary**: partner_1-only exposure
- **prod**: full partner rollout post canary approval

### 5.2 Release Model

- Trunk-based with short-lived feature branches
- Release candidates tagged for canary windows
- Feature flags control activation per partner
- No hot path release without checklist gate verification

### 5.3 Canary Rollout Plan

- T-48h: final RC build, checklist walkthrough, freeze non-critical merges
- T-0: launch to Partner 1 only
- T+24h: evaluate Phase 2 trigger metrics
- If green: unlock Partner 2
- If red: immediate feature-flag rollback and incident protocol

### 5.4 Operational Readiness

- Dashboards for frontend error rate, route latency, failed actions, auth failures
- Alert routing to Slack + PagerDuty for P0/P1 conditions
- Runbooks ready for:
  - frontend rollback
  - feature-flag disable
  - API/BFF outage degradation mode

---

## 6) Milestone Plan (Proposed)

| Week | Milestone | Exit Gate |
|---|---|---|
| Week 1 | Finalize UX specs + component map | Product/Eng sign-off |
| Week 2 | Core stability + ownership/flags hardening | Security + QA gate |
| Week 3 | Core launch flows complete | End-to-end smoke pass |
| Week 4 | Expanded MVP features complete | Feature acceptance pass |
| Week 5 | Mobile readiness + canary RC | Canary readiness review |
| Week 6 | Canary launch + Partner 2 decision | GO/NO-GO gate pass |

---

## 7) Ownership Model

- **Frontend Lead**: web app architecture, component delivery, release readiness
- **Mobile Lead**: iOS/Android parity and release track readiness
- **Backend/BFF Lead**: API contracts, BFF aggregation stability, flags + ownership guards
- **Product Lead**: UX scope decisions and UAT sign-off
- **Compliance Lead**: send-flow control approvals and audit visibility acceptance
- **DevOps**: deployment pipelines, environment health, rollback tooling

---

## 8) Definition of Done (Frontend)

A frontend feature is done when:

1. Implemented behind correct partner/feature guards
2. Integrated through BFF contract (no bypass)
3. Unit + integration + relevant e2e tests pass
4. Meets accessibility and responsive requirements
5. Emits required telemetry and error metadata
6. Included in release notes and runbook updates
7. Approved in UAT by Product and required domain owners

---

## 9) Immediate Next Actions (This Week)

- Confirm owner assignments for each expanded MVP feature.
- Freeze API response contracts for all `/api/gr/*` launch endpoints.
- Create per-feature tickets with acceptance criteria and test cases.
- Stand up canary-specific dashboard panel and alert thresholds.
- Schedule T-48h checklist rehearsal for canary launch week.

---

This plan is the frontend execution baseline for launch readiness. Any scope change requires Product + Engineering approval and checklist impact review.
