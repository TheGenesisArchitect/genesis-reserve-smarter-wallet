# Stripe Linked Debit Card / Payout Integration Handoff

## 1. Purpose
This document captures the current state of the linked debit card / funding / payout integration work in `genesis-privy` and provides the next engineering steps required to complete real processor integration and production readiness.

## 2. What has been completed

### 2.1 Frontend
- Added a new linked debit card onboarding path in `src/components/CardPage.tsx`.
- Integrated Stripe client-side flow with `@stripe/stripe-js` and `@stripe/react-stripe-js`.
- Added support for creating a Stripe `SetupIntent` from the app and confirming card setup in the UI.
- Wired `accountId` into the setup-intent request payload so the backend can tag the setup flow.

### 2.2 Backend
- Added a new server route: `src/app/api/gr/linked-debit-cards/setup-intent/route.ts`.
- Implemented `SetupIntent` creation using Stripe’s `setupIntents.create(...)` API.
- Extended `src/app/api/gr/_lib/card-service.ts` with card linking, funding, quote, payout, and webhook reconciliation logic.
- Added or updated backend helper functions for idempotency (`withIdempotency`) and rate limiting (`ensureNotRateLimited`).
- Implemented a mock processor adapter path and wiring for Stripe-style funding and payout reconciliation.

### 2.3 Tests
- Verified behavior in `__tests__/card-service-api.test.ts` for:
  - idempotency wrapper behavior
  - linked debit card creation and listing
  - add-money / funding lifecycle
  - funding eligibility and compliance blocking
  - webhook signature validation and funding status reconciliation
  - payout quote and push-to-card creation
  - payout reconciliation via webhook event
  - rate limiting behavior

## 3. Current implementation details

### 3.1 Primary files
- `src/components/CardPage.tsx`
- `src/app/api/gr/linked-debit-cards/setup-intent/route.ts`
- `src/app/api/gr/_lib/card-service.ts`
- `src/app/api/gr/_lib/stripe-card-adapter.ts`
- `src/app/api/gr/_lib/card-db.ts`
- `__tests__/card-service-api.test.ts`

### 3.2 What the backend currently models
- `LinkedDebitCard` objects with funding and payout eligibility flags.
- `FundingTransaction` objects with statuses such as `created`, `requires_action`, `authorized`, `captured`, `settled`, `failed`, `reversed`.
- `Payout` objects with statuses `created`, `pending_network`, `paid`, `failed`, `returned`.
- Webhook event reconciliation for both funding and payout status updates.
- Processor metadata fields: `processorReference`, `networkTokenRef`, `processorTokenRef`.

### 3.3 Stripe integration currently present
- `SetupIntent` creation for card onboarding.
- `payment_method_types: ['card']` and `usage: 'off_session'` on SetupIntent.
- `metadata.accountId` on SetupIntent.
- Webhook signature verification using environment-configured `STRIPE_WEBHOOK_SECRET`.

## 4. Gaps and remaining work

### 4.1 UI gaps
- No dedicated linked-card list or wallet card management view beyond the onboarding panel.
- No explicit add-money UI flow for funding a linked debit card from the client.
- No push-to-card payout UX is implemented yet in the app.
- No stateful display of funding or payout transaction progress in the UI.

### 4.2 Backend and processor integration gaps
- The current implementation is still mock-oriented for processor operations.
- Funding and payout creation do not yet map to real Stripe PaymentIntents / Payouts / Funding flows.
- Network-stage processing for payouts is modeled as `pending_network` but not connected to a real processor transfer method.
- Failure and retry handling for external processor events is not fully implemented.
- No stable persistence layer for production state beyond in-memory mock storage and optional DB helpers.

### 4.3 Data persistence gaps
- `card-db.ts` contains DB helpers, but the current handoff state still leans on a mock in-memory store for the card service test flow.
- Need to validate and complete DB persistence for:
  - linked debit cards
  - funding transactions
  - payouts
  - processor webhook events
  - idempotency records

### 4.4 Security / production readiness gaps
- Ensure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and other processor secrets are configured safely in environment secrets.
- Confirm webhook routes are secured and signature verification is enforced for processors.
- Confirm rate limiting and idempotency apply to all relevant mutation endpoints.

## 5. Recommended next steps

### 5.1 Complete frontend flows
1. Build a linked card list / management component.
2. Add UI for `Add Money` / funding a linked debit card.
3. Add UI for `Push to Card` payout creation and confirmation.
4. Surface funding and payout statuses in the app.

### 5.2 Tie backend flow to a real processor
1. Replace mock processor adapter logic with the Stripe processor implementation or the chosen issuing / payout provider.
2. Implement actual funding request creation and off-session authorization capture logic.
3. Implement actual push-to-card payout creation against the processor.
4. Map processor webhook event types to internal funding/payout statuses.
5. Add processor retry / failure handling and reconciliation.

### 5.3 Persist state reliably
1. Validate and complete DB migrations for linked cards, funding, payouts, and webhook events.
2. Ensure all mutation paths persist to the database instead of only in-memory store.
3. Add database-backed idempotency storage.

### 5.4 End-to-end verification
1. Add integration tests that exercise the full frontend-backed flow.
2. Add API tests for actual processor response mappings, including failures.
3. Perform manual end-to-end verification with test Stripe credentials.

## 6. Engineering handoff notes
- The current code is intentionally designed around a generic card service adapter with Stripe-specific helper functions in `stripe-card-adapter.ts`.
- `createPushToCardPayout()` now writes a `processorReference` and emits `payout.pending_network`, which is the expected next state before final settlement.
- Webhook reconciliation is already present in tests for both funding settlement and payout paid transitions.
- The current route `src/app/api/gr/linked-debit-cards/setup-intent/route.ts` is the primary entry point for onboarding new linked debit cards.

## 7. Suggested priorities
1. Ship the frontend flows for card linking, add-money, and payout initiation.
2. Connect funding/payout flows to the chosen processor and validate webhook reconciliation.
3. Convert mock storage to persistent DB-backed storage.
4. Harden security and error handling around the Stripe integration.

---

> This spec is intentionally scoped to the linked debit card / funding / payout integration that has been implemented so far. It should be used by the engineering team to complete the next integration stage and production handoff.
