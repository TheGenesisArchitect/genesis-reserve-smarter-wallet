# Vault Upgrade - Acceptance Criteria and QA Gates

This document defines release-ready acceptance criteria for the upgraded Vault journey.

## 1. Scope

Flows covered:
- Strategy Discovery
- Deposit
- Tracking
- Withdraw
- Education Nuggets
- Stability and fallback behavior

Environments:
- Local/dev
- Staging
- Canary

## 2. Global Acceptance Criteria

1. User can complete discovery -> deposit -> track -> withdraw without leaving app flow.
2. At no point should signed-in balance flash to empty/zero due to transient refresh or reconnect.
3. Every primary action has a clear pre-action explanation and post-action confirmation.
4. DeFi Depth is optional and never blocks the default path.
5. Last known values remain visible when upstream calls fail temporarily.

## 3. Screen-Level Acceptance Criteria

### A. Discovery

A1 - Strategy Finder
- Given user opens Vaults, when page loads, then recommended strategy appears within 2.5s on broadband.
- Given user selects intent tier, when recommendation refreshes, then rationale text updates.
- Given recommendation unavailable, then graceful fallback recommendation is shown with source label.

A2 - Compare
- Given user opens compare, then at least 3 strategies display with APY/risk/liquidity/fees/chain.
- Given user picks strategy, then selection persists into Deposit flow.

A3 - DeFi Depth
- Given user toggles DeFi Depth, then protocol/chain/stability details render without replacing default summary.

### B. Deposit

B1 - Amount
- Given signed-in user, available balance is visible.
- Invalid amount shows inline validation and blocks continue.
- Nugget `Only your entered amount is deployed` appears.

B2 - Funding rail
- Card, Bank, Wallet rails each show ETA and fee estimates.
- Recommended rail is visually indicated.

B3 - Review
- Plain language review includes strategy, APY range, liquidity profile, and settlement estimate.
- Confirmation CTA triggers submission only once per user click.

B4 - Success
- Success state includes amount, strategy, reference, and next action to track.

### C. Tracking

C1 - Overview
- Shows total, principal, profit, blended APY, yield today.
- Last updated timestamp present.

C2 - Positions
- Each position card includes current position, principal, profit, APY, network, status.

C3 - Timeline
- User sees APY and PnL trend with key events.

C4 - Health
- Circuit breaker and liquidity/depeg alerts surface when present.

### D. Withdraw

D1 - Amount
- Available now and scheduled liquidity are both visible.

D2 - Impact preview
- Projected APY impact and remaining principal shown before confirm.

D3 - Confirm
- Summary + ETA + fees displayed before final submit.

D4 - Success
- User receives reference + status + next action.

## 4. Education Nugget QA

- Nuggets appear at defined friction points only.
- Nugget text does not exceed two lines at mobile width 390px.
- Learn-more expands inline and is dismissible.
- Nugget events are emitted (`impression`, `expanded`, `learn_more_clicked`).

## 5. Stability and Persistence QA

1. Simulate wallet reconnect during tracking poll:
- Expected: last known balances remain visible.

2. Simulate upstream timeout for strategy/positions route:
- Expected: fallback envelope with last known data, no blank state.

3. Simulate WebSocket disconnect:
- Expected: UI switches to polling state label without losing metrics.

4. Simulate route error bursts (3 consecutive failures):
- Expected: non-blocking warning banner; retry available.

## 6. Performance Gates

- Discovery initial contentful render <= 2.5s (staging, broadband profile).
- Primary CTA to review transition <= 500ms perceived latency.
- Tracking refresh should not block user interactions.

## 7. Accessibility Gates

- Color contrast WCAG AA for core text and CTA states.
- Keyboard navigation for compare, rail selection, and confirm actions.
- Focus ring visible on interactive controls.
- Aria labels on key controls and status banners.

## 8. Analytics Verification

Must emit at minimum:
- `vault_discovery_opened`
- `vault_intent_selected`
- `vault_deposit_started`
- `vault_deposit_completed`
- `vault_tracking_opened`
- `vault_withdraw_started`
- `vault_withdraw_completed`
- `vault_balance_fallback_used`

## 9. Test Matrix

Dimensions:
- Device: mobile narrow, mobile wide, desktop
- Wallet state: signed out, signed in, reconnecting
- Data state: fresh, stale fallback, partial unavailable
- Strategy path: recommended, manual override
- Chain path: Arbitrum, Ethereum

## 10. Release Go/No-Go Checklist

Go criteria:
- All critical journey acceptance checks pass.
- No P0/P1 defects in deposit/withdraw or balance persistence.
- Error fallback behavior verified in staged chaos tests.
- Event emission completeness >= 99% in canary telemetry.

No-Go triggers:
- Balance blinking/blanking reproducible in signed-in session.
- Duplicate transaction submissions possible from double-click.
- Withdraw impact preview missing or incorrect.
- APY/risk copy materially misleading.
