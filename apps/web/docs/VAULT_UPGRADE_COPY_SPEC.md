# Vault Upgrade - Screen Copy Spec

This document provides production-ready copy per frame from the Vault blueprint.

## Voice and Tone

- Clear, concise, confidence-building.
- Explain risk without sounding alarming.
- Avoid jargon unless user enables DeFi Depth.
- Keep action labels explicit and outcome-oriented.

## A1. Vault Landing / Strategy Finder

Primary headline:
- Find the best strategy for your money

Subheadline:
- Choose your goal. We recommend a strategy based on yield, risk, and liquidity.

Intent chip labels:
- Preserve
- Grow
- Accelerate

Recommendation card labels:
- Recommended for you
- Estimated APY
- Risk
- Liquidity

Recommendation rationale line:
- Ranked by net APY, fee impact, liquidity speed, and strategy reliability.

Primary CTA:
- Get Started

Secondary CTA:
- Compare Options

Nugget:
- Why this strategy?
- We tailor this recommendation to your selected intent and current market conditions.

## A2. Strategy Compare Sheet

Header:
- Compare strategies

Subheader:
- See tradeoffs clearly before you choose.

Table columns:
- Strategy
- Net APY
- Risk
- Liquidity
- Fees
- Chain

Toggle:
- Show DeFi Depth
- Hide DeFi Depth

Row CTA:
- Select Strategy

Footer note:
- APY can change with market conditions.

## A3. DeFi Depth Expanded

Header:
- DeFi Depth

Sections:
- Protocol mix
- Chain exposure
- APY stability trend
- Yield source

Helper text:
- Advanced details are optional. Your core recommendation stays the same.

## B1. Deposit / Amount

Header:
- Enter deposit amount

Subheader:
- Choose how much you want to put to work.

Field label:
- Amount (USD)

Balance label:
- Available balance

Preset chips:
- $1
- $5
- $25
- $100
- $250
- Max

Primary CTA:
- Continue

Nugget:
- Only your entered amount is deployed.
- The rest of your balance stays accessible.

Validation copy:
- Enter an amount above $0.25.
- Amount exceeds available balance.

## B2. Deposit / Funding Rail

Header:
- Choose funding method

Subheader:
- Pick the rail that fits your speed and fee preference.

Rail card labels:
- Card
- Bank Transfer
- Wallet

Meta labels:
- Estimated time
- Estimated fee
- Recommended

Primary CTA:
- Continue to Review

## B3. Deposit / Review

Header:
- Review your deposit

Summary rows:
- Amount
- Strategy
- Funding method
- Estimated APY range
- Liquidity profile
- Estimated settlement time

Disclaimer:
- APY is variable and not guaranteed.

Primary CTA:
- Confirm Deposit

Secondary CTA:
- Back

Nugget:
- Your funds are allocated according to the selected strategy profile and monitored continuously.

## B4. Deposit / Success

Header:
- Deposit received

Subheader:
- Your funds are now processing.

Rows:
- Amount
- Strategy
- Reference
- Status

Primary CTA:
- Track Position

Secondary CTA:
- Add More Funds

## C1. Vault Position Overview

Header:
- Your vault position

Primary metrics:
- Total balance
- Principal
- Profit
- Blended APY
- Earned today

Timestamp label:
- Last updated

Status labels:
- Live
- Polling
- Syncing

## C2. Positions by Strategy

Header:
- Positions by strategy

Card labels:
- Current position
- Principal
- Profit
- APY
- Network

Status labels:
- Active
- Pending
- Paused

Empty state:
- No active positions yet.
- Start a deposit to begin earning.

## C3. Performance Timeline

Header:
- Performance timeline

Controls:
- 24H
- 7D
- 30D

Legend:
- APY
- PnL
- Events

Event labels:
- Deposit
- Withdraw
- Harvest
- Rebalance

## C4. Health and Alerts

Header:
- Vault health

Alert titles:
- Circuit breaker active
- Liquidity window notice
- Stablecoin depeg warning

Alert helper:
- What this means
- Recommended action

## D1. Withdraw / Amount

Header:
- Withdraw amount

Labels:
- Available now
- Scheduled liquidity
- Max withdraw

Primary CTA:
- Continue

Validation:
- Amount exceeds available position.

Nugget:
- Some funds may unlock on schedule depending on strategy liquidity.

## D2. Withdraw / Impact Preview

Header:
- Withdrawal impact preview

Rows:
- Withdrawal amount
- Remaining principal
- Projected APY after withdraw
- Estimated arrival time
- Estimated fees

Primary CTA:
- Continue to Confirm

## D3. Withdraw / Confirm

Header:
- Confirm withdrawal

Summary rows:
- Amount
- Destination
- ETA
- Fees

Primary CTA:
- Confirm Withdraw

Secondary CTA:
- Back

## D4. Withdraw / Success

Header:
- Withdrawal submitted

Subheader:
- We are processing your withdrawal.

Rows:
- Amount
- Reference
- Status
- ETA

Primary CTA:
- Back to Vault

Secondary CTA:
- View Activity

## Error and Recovery Copy

Generic network error:
- We could not refresh data right now. Showing your last known values.

Action:
- Retry

Execution error:
- We could not complete this transaction. No funds were moved.

Action:
- Try Again
- Contact Support

## Microcopy Tokens (for consistency)

- `expected_apy_disclaimer`: APY is variable and not guaranteed.
- `last_known_balance_notice`: Showing last known values while we reconnect.
- `liquidity_window_notice`: Some funds may unlock on schedule.
- `amount_deployed_notice`: Only your entered amount is deployed.
