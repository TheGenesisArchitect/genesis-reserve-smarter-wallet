# Vault Upgrade - Event Taxonomy

Use these events to measure simplicity, clarity, conversion, and trust in the upgraded Vault experience.

## 1. Event Naming Convention

Format:
- `vault_<journey>_<action>`

Examples:
- `vault_discovery_opened`
- `vault_deposit_confirmed`
- `vault_withdraw_completed`

## 2. Common Event Properties

Attach to all vault events where applicable:
- `wallet_address`
- `account_id`
- `session_id`
- `strategy_id`
- `strategy_label`
- `intent_tier` (preserve | grow | accelerate)
- `network`
- `chain_id`
- `source` (recommended | manual | default)
- `defi_depth_enabled` (true | false)
- `timestamp_ms`

## 3. Discovery Events

- `vault_discovery_opened`
  - when user lands on vault strategy finder

- `vault_intent_selected`
  - props: `intent_tier`

- `vault_recommendation_viewed`
  - props: `strategy_id`, `source`, `recommendation_reason`

- `vault_compare_opened`

- `vault_compare_strategy_selected`
  - props: `strategy_id`, `selected_rank`

- `vault_defi_depth_toggled`
  - props: `defi_depth_enabled`

## 4. Education Nugget Events

- `vault_nugget_impression`
  - props: `nugget_id`, `journey_step`

- `vault_nugget_expanded`
  - props: `nugget_id`, `journey_step`

- `vault_nugget_learn_more_clicked`
  - props: `nugget_id`, `journey_step`

Suggested nugget IDs:
- `rank_reason`
- `risk_plain_language`
- `only_entered_amount_deployed`
- `apy_not_guaranteed`
- `withdraw_liquidity_window`

## 5. Deposit Events

- `vault_deposit_started`
  - props: `strategy_id`, `intent_tier`, `source`

- `vault_deposit_amount_entered`
  - props: `amount_usd`, `amount_bucket`

- `vault_deposit_rail_selected`
  - props: `rail` (card | bank | wallet)

- `vault_deposit_review_opened`

- `vault_deposit_confirm_clicked`

- `vault_deposit_submitted`
  - props: `tx_reference`, `idempotency_key`

- `vault_deposit_completed`
  - props: `tx_hash`, `settlement_time_ms`

- `vault_deposit_failed`
  - props: `error_code`, `error_type`, `step`

## 6. Tracking Events

- `vault_tracking_opened`

- `vault_position_card_viewed`
  - props: `strategy_id`, `network`

- `vault_performance_timeline_viewed`

- `vault_health_alert_viewed`
  - props: `alert_type`

- `vault_balance_fallback_used`
  - props: `fallback_source` (cached | bff | onchain)

- `vault_balance_visible_state_changed`
  - props: `from_state`, `to_state`

## 7. Withdraw Events

- `vault_withdraw_started`
  - props: `strategy_id`, `source`

- `vault_withdraw_amount_entered`
  - props: `amount_usd`, `amount_bucket`

- `vault_withdraw_impact_preview_opened`

- `vault_withdraw_confirm_clicked`

- `vault_withdraw_submitted`
  - props: `tx_reference`

- `vault_withdraw_completed`
  - props: `tx_hash`, `settlement_time_ms`

- `vault_withdraw_failed`
  - props: `error_code`, `error_type`, `step`

## 8. Derived KPI Queries

Core funnel:
- discovery open -> deposit started -> deposit completed

Trust and stability:
- count of `vault_balance_fallback_used`
- rate of `vault_balance_visible_state_changed` to zero/empty during active session

Education effectiveness:
- nugget impression -> nugget expand -> completion rate lift

## 9. Guardrails

- Do not log private keys, full PII, or raw card/bank details.
- Hash wallet addresses for analytics exports when required by policy.
- Enforce schema validation for event payloads in the client tracking utility.

## 10. Implementation Pointers

Likely integration points:
- `src/components/VaultsPage.tsx`
- `src/components/DepositFlow.tsx`
- `src/components/WalletHome.tsx`
- `src/hooks/useGenesisVault.ts`
- `src/hooks/useYieldEngine.ts`

Add analytics wrapper utility if absent:
- `src/lib/analytics.ts`

## 11. Frame-to-Event Mapping

Use this mapping during design QA and engineering implementation.

- `A1 Vault Landing`:
  - `vault_discovery_opened`
  - `vault_intent_selected`
  - `vault_recommendation_viewed`

- `A2 Compare Sheet`:
  - `vault_compare_opened`
  - `vault_compare_strategy_selected`
  - `vault_defi_depth_toggled`

- `B1 Deposit Amount`:
  - `vault_deposit_started`
  - `vault_deposit_amount_entered`
  - `vault_nugget_impression` (`only_entered_amount_deployed`)

- `B2 Funding Rail`:
  - `vault_deposit_rail_selected`

- `B3 Review`:
  - `vault_deposit_review_opened`
  - `vault_deposit_confirm_clicked`
  - `vault_nugget_impression` (`apy_not_guaranteed`)

- `B4 Success`:
  - `vault_deposit_submitted`
  - `vault_deposit_completed` or `vault_deposit_failed`

- `C1-C4 Tracking`:
  - `vault_tracking_opened`
  - `vault_position_card_viewed`
  - `vault_performance_timeline_viewed`
  - `vault_health_alert_viewed`
  - `vault_balance_fallback_used`

- `D1-D4 Withdraw`:
  - `vault_withdraw_started`
  - `vault_withdraw_amount_entered`
  - `vault_withdraw_impact_preview_opened`
  - `vault_withdraw_confirm_clicked`
  - `vault_withdraw_submitted`
  - `vault_withdraw_completed` or `vault_withdraw_failed`

## 12. Ownership and Validation

- Product Analytics owner validates taxonomy completeness before implementation freeze.
- Frontend owner validates payload schema at runtime and drops invalid events.
- QA owner validates event firing with deterministic test scenarios for each frame.
