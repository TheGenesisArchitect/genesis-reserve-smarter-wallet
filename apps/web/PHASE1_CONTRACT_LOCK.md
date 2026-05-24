# Phase 1 — BFF Contract Lock

Date: 2026-03-28

## Completed in this pass

### Validation foundation
- Added `zod` dependency
- Added shared schemas in [src/lib/validation.ts](src/lib/validation.ts)
- Extended `getJson()` to support schema parsing in [src/lib/apiClient.ts](src/lib/apiClient.ts)
- Extended `useBFFData()` to accept `schema` in [src/hooks/useBFFData.ts](src/hooks/useBFFData.ts)

### Live hooks now schema-validated
- `useDashboardSnapshot()`
- `useHistoryEntries()`
- `useAccountResolver()`
- `useYieldSnapshot()`
- `useAnalytics()`
- `useScheduledSends()`
- `useComplianceScreen()`
- `useSendOrder()`
- `useFinalizeSend()`
- `useBatchOperations()`
- `useSendQuote()`

### Contract families now typed and locked
Defined in [src/lib/bff.types.ts](src/lib/bff.types.ts):
- Dashboard
- History
- Yield
- Accounts
- Send flow
- Analytics
- Scheduled sends
- Batch operations
- Compliance view
- Partner admin console
- Settings view

## Locked response families

### Existing live/implemented
- `DashboardResponse`
- `HistoryResponse`
- `YieldResponse`
- `AccountsResponse`
- `SendQuoteResponse`
- `ComplianceScreenResponse`
- `SendOrderResponse`
- `FinalizeSendResponse`
- `AnalyticsResponse`
- `ScheduledSendsResponse`
- `ScheduledSendMutationResponse`
- `BatchOperationResponse`

### Locked for next implementation slices
- `ComplianceViewResponse`
- `AdminConsoleResponse`
- `SettingsResponse`

## Next routes to implement against locked contracts

### Compliance slice
- `GET /api/gr/compliance-view?walletAddress=...`
  - Return `ComplianceViewResponse`

### Admin slice
- `GET /api/gr/admin/console`
  - Return `AdminConsoleResponse`

### Settings slice
- `GET /api/gr/settings?walletAddress=...`
  - Return `SettingsResponse`

## Acceptance gate for Phase 1
- Query and mutation hooks parse responses against schemas
- Shared BFF types exist for active and near-term views
- TypeScript build passes clean
- No direct backend coupling added to frontend components

## Notes
- Current send quote hook path was normalized to `/api/gr/remittance/quote...` during this pass
- Admin/settings/compliance view contracts are defined now even before route implementation so UI work can proceed against frozen shapes
