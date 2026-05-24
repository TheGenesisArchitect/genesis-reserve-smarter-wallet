# Phase 2 — View Parity Matrix (Audit-Corrected)

Date: March 29, 2026  
Baseline: genesis-enterprise-dashboard.html prototype  
Target: genesis-privy-integration/genesis-privy

Legend: 🟢 Live = real backend data | 🟡 Hybrid = partially live or not fully wired | 🔴 Simulated = deterministic/mock

---

## 0. Audit Delta Summary

This file is corrected against current repository code, with route verification from gr/gr/services/api/index.ts.

Critical corrections applied:
1. Treasury balance path corrected to GET /v1/treasury/balance/:accountId
2. Finalize step corrected to POST /v1/treasury/finalize (body includes reservationId)
3. Remittance order path corrected to POST /v1/remittance/order (singular)
4. WalletBalance data source corrected (useYieldEngine/useGenesisVault chain, not wagmi useBalance)
5. Send flow updated to reflect live quote-stage integration in SendFlow UI flow
6. Recipient address book blocker removed (routes + migration + BFF + UI delivered)

---

## 1. View Coverage (Corrected)

| View Key     | Component              | Route / Source                  | Hook(s)                                 | Status | Notes |
|--------------|------------------------|---------------------------------|-----------------------------------------|--------|-------|
| dashboard    | DashboardSnapshotPanel | /api/gr/dashboard               | useDashboardSnapshot                    | 🟢     | Live via BFF |
| dashboard    | YieldEngineDashboard   | /api/gr/yield                   | useYieldSnapshot                        | 🟢     | Hook exists and is wired |
| dashboard    | WalletBalance          | on-chain + engine composition   | useYieldEngine → useGenesisVault internals | 🟢  | Not wagmi useBalance |
| dashboard    | HistoryPanel           | /api/gr/history                 | useHistoryEntries                       | 🟢     | Live via BFF |
| yield        | YieldEngineDashboard   | /api/gr/yield                   | useYieldSnapshot                        | 🟢     | Same as dashboard right rail |
| deposit      | DepositFlow            | /api/gr/deposit/* + compliance gate | useComplianceGate + mutations      | 🟡     | Mixed on-chain gate and BFF flow |
| send         | SendFlow               | /api/gr/compliance + /api/gr/remittance/order + /api/gr/treasury/finalize + quote path | useComplianceGate + send orchestration + useSendQuote | 🟢 | Quote, order/reserve, and finalize are wired in UI flow |
| history      | HistoryPanel           | /api/gr/history                 | useHistoryEntries                       | 🟢     | Standalone route view |
| compliance   | ComplianceViewPanel    | /api/gr/compliance-view         | useComplianceView                       | 🟢     | Backend normalized compliance view |
| analytics    | AnalyticsDashboard     | /api/gr/analytics               | useAnalytics                            | 🔴     | No backend analytics router/table contract yet |
| scheduled    | ScheduledSendsPanel    | /api/gr/scheduled-sends         | useScheduledSends                       | 🔴     | No scheduled send backend infrastructure |
| batch        | BatchOperationsPanel   | /api/gr/batch                   | useBatchOperations                      | 🔴     | No backend batch infrastructure |
| admin        | AdminConsolePanel      | /api/gr/admin/console           | useAdminConsole                         | 🔴     | BFF deterministic mock |
| settings     | SettingsPanel          | /api/gr/settings                | useSettings                             | 🟡     | Live chain config + backend health probe |

---

## 2. Hook Reality Map

Hooks now exist with Phase-2 naming, but usage parity is not complete.

| Hook | Exists | Wired in production view flow | Notes |
|------|--------|-------------------------------|-------|
| useDashboardSnapshot | ✅ | ✅ | DashboardSnapshotPanel uses it |
| useYieldSnapshot | ✅ | ✅ | YieldEngineDashboard path is live |
| useHistoryEntries | ✅ | ✅ | HistoryPanel uses it |
| useSendQuote | ✅ | ✅ | Integrated into SendFlow pre-send quote stage |
| useComplianceView | ✅ | ✅ | Compliance panel display view |
| useComplianceGate | ✅ | ✅ | On-chain gating remains in Deposit/Send flows |

Decision locked for implementation:
- useComplianceGate remains gate-of-truth for send/deposit permissions.
- useComplianceView remains backend normalized display surface.

---

## 3. Missing Backend Infrastructure (Hard Blockers)

Current status in code/migrations:

1. Analytics
- Missing backend analytics router and explicit API contract.
- Existing DB views can help (v_revenue_summary, v_corridor_performance) but no dedicated endpoint surface.

2. Scheduled Sends
- No scheduled_sends table in 001_master_schema.sql.
- No scheduled remittance API routes.
- Existing cron work is yield-focused, not user payment scheduling.

3. Batch Operations
- No batch table, route, or service class.

4. Admin Console backend
- No /v1/admin/* router in api/index.ts.

5. Recipient Address Book
- Delivered in current branch:
	- recipients migration added
	- backend route family added (`GET/POST/PATCH`)
	- BFF routes added (`GET/POST/PATCH`)
	- UI components and hooks wired into SendFlow

---

## 4. Backend Routes Verified Live (Corrected)

Verified against gr/gr/services/api/index.ts.

| Backend Route | Status | Notes |
|---------------|--------|-------|
| GET /v1/compliance/status/:walletAddress | ✅ | Live |
| POST /v1/compliance/screen | ✅ | Live |
| GET /v1/treasury/balance/:accountId | ✅ | Correct balance route |
| GET /v1/ledger/entries/:accountId | ✅ | Correct history route |
| POST /v1/remittance/quote | ✅ | Live quote endpoint |
| POST /v1/remittance/order | ✅ | Singular order endpoint |
| POST /v1/treasury/reserve | ✅ | Reservation step |
| POST /v1/treasury/finalize | ✅ | Finalize step (reservationId in body) |
| GET /v1/treasury/yield/:accountId | ✅ | Live yield endpoint |
| /v1/admin/* | ❌ | Missing |

Correction reference:

| Wrong (old matrix) | Correct |
|--------------------|---------|
| GET /v1/treasury/accounts/:id/balance | GET /v1/treasury/balance/:accountId |
| POST /v1/remittance/orders/:id/execute | POST /v1/treasury/finalize |
| POST /v1/remittance/orders | POST /v1/remittance/order |

---

## 5. Send Flow Target Architecture

Current SendFlow wiring:
1. compliance/screen mutation
2. send order mutation
3. finalize mutation

Gap:
- Quote step is not currently an active pre-send stage in SendFlow UI logic.

Target 4-step architecture:
1. GET /api/gr/send?action=quote → POST /v1/remittance/quote
2. POST /api/gr/compliance/screen → POST /v1/compliance/screen
3. POST /api/gr/send?action=reserve → POST /v1/treasury/reserve
4. POST /api/gr/send?action=finalize → POST /v1/treasury/finalize

---

## 6. Pre-Sprint Gating Actions

Before Sprint 2-A:
1. Keep this corrected route table as single source of truth.
2. Add SendFlow quote stage integration using existing useSendQuote hook.
3. Maintain dual compliance model: on-chain gate + backend display.

Before Sprint 2-B:
1. ✅ Completed: Add recipients table migration.
2. ✅ Completed: Add backend and BFF recipient routes.
3. Next: add recipient integration tests and release evidence.

Before Sprint 2-C:
1. Add adminRouter at /v1/admin with separate admin auth boundary.
2. Define minimum endpoints:
	- GET /v1/admin/stats
	- GET /v1/admin/users
	- GET /v1/admin/users/:id
	- POST /v1/admin/users/:id/approve

Sprint 2-D preparation (can start in 2-C):
1. Add notifications table in migration 002.
2. Add event subscriber for yield.harvest and remittance.settled to write notifications.
3. Expose BFF unread feed route for topbar/toast rail.
