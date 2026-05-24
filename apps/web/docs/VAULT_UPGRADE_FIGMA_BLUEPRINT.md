# Vault Upgrade - Figma Blueprint and Build Plan

This document translates the upgraded Vault journey into a Figma-ready screen map and an implementation plan for the current Genesis frontend.

## 1. Product Intent

Primary UX goal: make the best yield strategy easy to find, deposit, track, and withdraw with minimal cognitive load.

Design principles:
- One primary action per screen.
- Explain value and risk before asking for commitment.
- Progressive disclosure for advanced users (DeFi Depth toggle).
- Preserve trust with stable balances and clear status states.
- Embed education as short context nuggets, not tutorials.

## 2. Figma Frame Map

Create one Figma page: `Vault Upgrade v1`.

### Section A - Discovery

Frame A1: `Vault Landing / Strategy Finder`
- Header: `Find your best strategy`
- Intent chips: `Preserve`, `Grow`, `Accelerate`
- Recommendation card (top strategy)
- CTA: `Get Started`
- Secondary: `Compare options`

Frame A2: `Strategy Compare Sheet`
- Table columns: APY, risk, liquidity, fees, chain
- Rows: top 3 ranked strategies
- Toggle: `Show DeFi Depth`
- CTA: `Select strategy`

Frame A3: `DeFi Depth Expanded`
- Protocol mix
- Chain exposure
- Historical APY stability
- Yield source label

### Section B - Deposit

Frame B1: `Deposit / Amount`
- Amount input
- Preset chips
- Available balance
- Nugget: `Only your entered amount is deployed`

Frame B2: `Deposit / Funding Rail`
- Methods: Card, Bank, Wallet
- Fee and ETA per rail
- Recommendation badge for default rail

Frame B3: `Deposit / Review`
- Plain language summary
- Strategy, expected APY range, liquidity profile
- Disclaimer: expected range, not guarantee
- CTA: `Confirm Deposit`

Frame B4: `Deposit / Success`
- Confirmed amount and reference
- Strategy label
- CTA: `Track Position`

### Section C - Tracking

Frame C1: `Vault Position Overview`
- Total balance
- Principal vs profit
- Blended APY
- Yield earned today
- Last updated timestamp

Frame C2: `Positions by Strategy`
- Cards with current position, principal, profit, APY
- Network badge
- Status badge: active, paused, pending

Frame C3: `Performance Timeline`
- APY timeline and PnL trend
- Events: harvest, rebalance, deposit, withdraw

Frame C4: `Health and Alerts`
- Circuit breaker status
- Liquidity warning
- Depeg monitor
- Explainers for each alert

### Section D - Withdraw

Frame D1: `Withdraw / Amount`
- Available now
- Scheduled liquidity amount
- Max action

Frame D2: `Withdraw / Impact Preview`
- New projected APY after withdrawal
- Remaining principal and active strategies
- ETA and fees

Frame D3: `Withdraw / Confirm`
- Final summary
- CTA: `Confirm Withdraw`

Frame D4: `Withdraw / Success`
- Confirmation + ETA to wallet/bank
- CTA: `Back to Vault`

## 3. Component Inventory (Design System)

Core components:
- `StrategyRecommendationCard`
- `StrategyCompareTable`
- `DeFiDepthPanel`
- `EducationNugget`
- `RailOptionCard`
- `ReviewSummaryCard`
- `PositionCard`
- `YieldTimelineChart`
- `HealthAlertItem`
- `ImpactPreviewCard`
- `TransactionStatusBanner`

State variants required for each core component:
- loading
- ready
- empty
- warning
- error

## 4. Embedded Education Nugget System

Nugget rules:
- Max 2 lines body copy.
- Positioned immediately above a high-friction decision.
- Include a `Learn more` link to inline details.
- Never block the primary action.

Nugget slots by journey step:
- Discovery: `How recommendations are chosen`
- Compare: `What risk means here`
- Amount: `Only selected amount is deployed`
- Review: `Expected APY vs guaranteed return`
- Tracking: `Why APY can change`
- Withdraw: `Immediate vs scheduled liquidity`

Sample nugget copy:
- `We rank strategies by net APY, fees, liquidity, and reliability, then tailor results to your selected intent.`
- `APY is variable and can move with market conditions. We show a range based on recent data.`
- `Withdrawals can include instantly available funds and funds that unlock on strategy schedule.`

## 5. Information Architecture for Simplicity + Depth

Default mode (everyday users):
- Intent selection
- One recommendation
- One clear CTA
- Minimal metrics

Advanced mode (power users):
- DeFi Depth toggle
- Allocation internals
- Strategy provenance
- Chain and protocol detail

This preserves ease-of-use while exposing depth on demand.

## 6. API and Data Mapping (Current App)

Keep frontend complexity low by using BFF-normalized payloads.

Recommended normalized payload groups:
- Strategy Discovery: ranked list + recommendation reason
- Deposit Plan: bytecode/user-op plan + estimated settlement
- Position Tracking: principal/profit/APY + totalUnderlyingBalanceUSD
- Withdraw Plan: available now vs scheduled + APY impact preview

## 7. Build Plan Mapped to Existing Files

Discovery and recommendation UI:
- `src/components/VaultsPage.tsx`
- `src/components/YieldEngineDashboard.tsx`

Deposit UX and execution:
- `src/components/DepositFlow.tsx`
- `src/hooks/useGenesisVault.ts`
- `src/app/api/gr/deposit/*`

Tracking and persistence:
- `src/components/WalletHome.tsx`
- `src/hooks/useYieldEngine.ts`
- `src/hooks/usePortfolioBalances.ts`
- `src/app/api/gr/dashboard/route.ts`
- `src/app/api/gr/portfolio/route.ts`

Withdraw UX:
- `src/hooks/useGenesisVault.ts`
- (add if needed) `src/components/WithdrawFlow.tsx`
- (add if needed) `src/app/api/gr/withdraw/*`

## 8. Execution Phases

Phase 1: Discovery and recommendation
- Implement Strategy Finder and Compare sheet
- Add recommendation rationale

Phase 2: Deposit simplification
- Improve amount, rail, review, and success states
- Add education nuggets to deposit flow

Phase 3: Tracking clarity
- Unified position cards and performance timeline
- Stable last-known balance and status labeling

Phase 4: Withdraw confidence
- Add impact preview and liquidity windows
- Add educational support for withdrawal timing

## 9. Success Metrics

User metrics:
- Vault CTA to deposit start rate
- Deposit completion rate
- Withdraw completion rate
- Time to first successful deposit
- Return visits to tracking views

Trust metrics:
- Balance flicker incidents
- Failed transaction rate
- Support tickets for APY confusion
- Support tickets for withdrawal timing confusion

Learning metrics:
- Nugget open rate
- Nugget click-through to learn-more
- Reduction in repeated confusion events

## 10. Next Planning Deliverables

Create next:
1. Wireframe-level copy spec per frame.
2. Event taxonomy and analytics tracking plan.
3. API contract schema for BFF normalization.
4. Acceptance criteria per screen for QA and release gating.
