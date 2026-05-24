# Vault Upgrade - BFF API Contract Schemas

This document defines normalized API contracts for frontend consumption.
All upstream complexity (Genesis + DeFrame) should be handled in BFF routes.

## 1. Design Rules

- Frontend never consumes raw upstream payloads directly.
- All responses include `fetchedAt` and `source` metadata.
- All numeric money fields are strings to avoid float precision issues.
- Network and strategy IDs are canonical across all routes.

## 2. Shared Types

```ts
export type IntentTier = 'preserve' | 'grow' | 'accelerate'
export type RiskLevel = 'low' | 'medium' | 'high'
export type LiquidityWindow = 'instant' | 'same_day' | 'scheduled'

export interface ApiMeta {
  fetchedAt: string
  source: 'genesis' | 'deframe' | 'hybrid' | 'fallback'
  requestId?: string
}

export interface StrategySummary {
  strategyId: string
  label: string
  protocol: string
  chain: string
  chainId: number
  netApyPct: string
  avgApyPct?: string
  inceptionApyPct?: string
  riskLevel: RiskLevel
  liquidityWindow: LiquidityWindow
  feeBps: number
  paused: boolean
  availableActions: Array<'lend' | 'withdraw'>
}
```

## 3. GET /api/gr/vault/strategies

Purpose:
- Return ranked strategy list and recommendation by intent.

Query params:
- `intentTier` (required)
- `walletAddress` (optional)
- `chainScope` (optional, default `arbitrum,ethereum`)

Response:

```json
{
  "intentTier": "grow",
  "recommendedStrategyId": "Aave-USDC-arbitrum",
  "recommendationReason": "Best net APY with medium risk and fast liquidity",
  "strategies": [
    {
      "strategyId": "Aave-USDC-arbitrum",
      "label": "Aave USDC",
      "protocol": "Aave",
      "chain": "arbitrum",
      "chainId": 42161,
      "netApyPct": "5.14",
      "avgApyPct": "4.88",
      "inceptionApyPct": "4.21",
      "riskLevel": "medium",
      "liquidityWindow": "instant",
      "feeBps": 0,
      "paused": false,
      "availableActions": ["lend", "withdraw"]
    }
  ],
  "meta": {
    "fetchedAt": "2026-04-28T18:00:00.000Z",
    "source": "hybrid"
  }
}
```

## 4. GET /api/gr/vault/strategies/:strategyId

Purpose:
- Return details for selected strategy (for compare/depth/review).

Response additions:
- `deFiDepth`: protocol mix, chain exposure, apy stability buckets.

```json
{
  "strategy": {
    "strategyId": "Aave-USDC-arbitrum",
    "label": "Aave USDC",
    "protocol": "Aave",
    "chain": "arbitrum",
    "chainId": 42161,
    "netApyPct": "5.14",
    "riskLevel": "medium",
    "liquidityWindow": "instant",
    "feeBps": 0,
    "paused": false,
    "availableActions": ["lend", "withdraw"]
  },
  "deFiDepth": {
    "protocolMix": [{ "name": "Aave", "weightPct": "100.00" }],
    "chainExposure": [{ "chain": "arbitrum", "weightPct": "100.00" }],
    "apyStability": {
      "volatilityBand": "low",
      "drawdownPct": "0.62"
    }
  },
  "meta": {
    "fetchedAt": "2026-04-28T18:00:00.000Z",
    "source": "hybrid"
  }
}
```

## 5. POST /api/gr/vault/deposit-plan

Purpose:
- Generate executable plan for deposit (lend).

Body:

```json
{
  "walletAddress": "0x...",
  "strategyId": "Aave-USDC-arbitrum",
  "amountAtomic": "10000000",
  "fromChainId": 1,
  "fromTokenAddress": "0x...",
  "toTokenAddress": "0x...",
  "intentTier": "grow"
}
```

Response:

```json
{
  "planId": "plan_dep_123",
  "strategyId": "Aave-USDC-arbitrum",
  "action": "lend",
  "amountAtomic": "10000000",
  "amountUsd": "10.00",
  "isCrossChain": false,
  "isSameChainSwap": false,
  "crossChainQuoteId": null,
  "estimatedSettlementSeconds": 120,
  "transactionPlan": [
    { "to": "0x...", "data": "0x...", "value": "0", "chainId": 42161 }
  ],
  "meta": {
    "fetchedAt": "2026-04-28T18:00:00.000Z",
    "source": "hybrid"
  }
}
```

## 6. POST /api/gr/vault/withdraw-plan

Purpose:
- Generate executable plan for withdraw.

Body:

```json
{
  "walletAddress": "0x...",
  "strategyId": "Aave-USDC-arbitrum",
  "amountAtomic": "5000000"
}
```

Response:

```json
{
  "planId": "plan_wdr_123",
  "strategyId": "Aave-USDC-arbitrum",
  "action": "withdraw",
  "amountAtomic": "5000000",
  "amountUsd": "5.00",
  "availableNowUsd": "4.20",
  "scheduledUsd": "0.80",
  "projectedApyAfterWithdrawPct": "4.97",
  "estimatedSettlementSeconds": 300,
  "transactionPlan": [
    { "to": "0x...", "data": "0x...", "value": "0", "chainId": 42161 }
  ],
  "meta": {
    "fetchedAt": "2026-04-28T18:00:00.000Z",
    "source": "hybrid"
  }
}
```

## 7. GET /api/gr/vault/positions

Purpose:
- Unified tracking model for Home + Vaults tracking panels.

Query:
- `walletAddress` (required)

Response:

```json
{
  "walletAddress": "0x...",
  "summary": {
    "totalBalanceUsd": "1245.55",
    "principalUsd": "1200.00",
    "profitUsd": "45.55",
    "blendedApyPct": "5.11",
    "yieldTodayUsd": "0.72",
    "lastUpdatedAt": "2026-04-28T18:00:00.000Z"
  },
  "positions": [
    {
      "strategyId": "Aave-USDC-arbitrum",
      "label": "Aave USDC",
      "protocol": "Aave",
      "chain": "arbitrum",
      "chainId": 42161,
      "status": "active",
      "currentPositionUsd": "1000.48",
      "principalUsd": "1000.00",
      "profitUsd": "0.48",
      "apyPct": "4.17",
      "avgApyPct": "4.12",
      "inceptionApyPct": "3.85",
      "liquidityWindow": "instant"
    }
  ],
  "health": {
    "circuitBreakerActive": false,
    "usdcPrice": "1.0000",
    "alerts": []
  },
  "meta": {
    "fetchedAt": "2026-04-28T18:00:00.000Z",
    "source": "hybrid"
  }
}
```

## 8. Error Envelope (All Routes)

```json
{
  "error": {
    "code": "vault_upstream_unavailable",
    "message": "Could not refresh upstream strategy data",
    "retryable": true
  },
  "fallback": {
    "usingLastKnownData": true
  },
  "meta": {
    "fetchedAt": "2026-04-28T18:00:00.000Z",
    "source": "fallback"
  }
}
```

## 9. Frontend Consumption Rules

- If route returns fallback + last known data, keep primary metrics visible and show subtle reconnect banner.
- Never clear existing visible balances unless user signs out.
- Treat `paused=true` as non-blocking for tracking, blocking for new deposits.

## 10. Suggested Route Implementation Targets

- `src/app/api/gr/vault/strategies/route.ts`
- `src/app/api/gr/vault/strategies/[strategyId]/route.ts`
- `src/app/api/gr/vault/deposit-plan/route.ts`
- `src/app/api/gr/vault/withdraw-plan/route.ts`
- `src/app/api/gr/vault/positions/route.ts`
