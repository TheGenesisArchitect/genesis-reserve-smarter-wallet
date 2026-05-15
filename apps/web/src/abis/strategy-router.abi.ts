// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/src/abis/strategy-router.abi.ts
//
// StrategyRouter.sol ABI — the yield allocation brain of Genesis Reserve.
// Deployed: 0xD7ff8383eBBE3B1023d95A3f14c32D9941Ac9e84 (Arbitrum One)
//
// Responsibilities:
//   - Routes USDC across protocol adapters (Aave, Balancer, T-Bills, Morpho)
//   - Enforces 40% max concentration per protocol (on-chain invariant)
//   - Executes 15-minute rebalancing epochs
//   - Triggers harvest() on each adapter to collect yield
//   - Manages INSTANT → HOURS → DAYS liquidity band waterfall
// ─────────────────────────────────────────────────────────────────────────────

export const STRATEGY_ROUTER_ABI = [

  // ── Allocation Reads ─────────────────────────────────────────────────────

  // Returns the full allocation state for all registered adapters.
  // This is the primary read for the UI allocation bar.
  {
    name: 'getStrategyAllocations',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: 'allocations',
        type: 'tuple[]',
        components: [
          { name: 'adapter',      type: 'address' },   // Adapter contract address
          { name: 'name',         type: 'string'  },   // Human-readable name ("Aave V3")
          { name: 'deployedUsdc', type: 'uint256' },   // USDC currently deployed (6 dec)
          { name: 'maxBps',       type: 'uint256' },   // Max allocation in bps (4000 = 40%)
          { name: 'currentBps',   type: 'uint256' },   // Current allocation in bps
          { name: 'riskScore',    type: 'uint256' },   // Risk score 0–100
          { name: 'liquidityBand',type: 'uint8'   },   // 0=INSTANT, 1=HOURS, 2=DAYS
          { name: 'isActive',     type: 'bool'    },   // Whether adapter is enabled
        ],
      },
    ],
  },

  // Returns current yield snapshot: deployed capital + blended APY
  {
    name: 'getYieldSnapshot',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'totalDeployed',     type: 'uint256' },  // Total USDC deployed across all strategies
      { name: 'blendedApyBps',     type: 'uint256' },  // Blended weighted APY in bps (530 = 5.30%)
      { name: 'lastHarvestTime',   type: 'uint256' },  // Unix timestamp of last harvest
      { name: 'nextHarvestTime',   type: 'uint256' },  // Unix timestamp of next scheduled harvest
      { name: 'totalYieldAccrued', type: 'uint256' },  // Total yield accrued since deployment (6 dec)
    ],
  },

  // Returns APY for a single adapter (used for per-protocol display)
  {
    name: 'getAdapterApy',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'adapter', type: 'address' }],
    outputs: [{ name: 'apyBps', type: 'uint256' }],  // APY in bps (412 = 4.12%)
  },

  // Returns the count of registered adapters
  {
    name: 'adapterCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'count', type: 'uint256' }],
  },

  // Returns liquidity band designation for an adapter
  // 0 = INSTANT (same-block withdrawal)
  // 1 = HOURS (2–8 hour withdrawal window)
  // 2 = DAYS (1–3 day redemption period)
  {
    name: 'getLiquidityBand',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'adapter', type: 'address' }],
    outputs: [{ name: 'band', type: 'uint8' }],
  },

  // Returns whether a withdrawal of amount USDC can be fulfilled immediately
  // Used before any withdraw() call to check liquidity availability
  {
    name: 'canWithdraw',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [{ name: 'available', type: 'bool' }],
  },

  // ── Epoch + Harvest Reads ────────────────────────────────────────────────

  // Returns the epoch state — used to display time-to-next-harvest in UI
  {
    name: 'getEpochState',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'epochNumber',    type: 'uint256' },  // Current epoch number (increments on harvest)
      { name: 'epochStartTime', type: 'uint256' },  // Unix timestamp epoch started
      { name: 'epochDuration',  type: 'uint256' },  // Epoch length in seconds (900 = 15 min)
      { name: 'harvestCount',   type: 'uint256' },  // Total harvest operations executed
    ],
  },

  // Returns cumulative harvest data for APY calculation and dashboard
  {
    name: 'getHarvestHistory',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'fromEpoch', type: 'uint256' },  // Start epoch (inclusive)
      { name: 'toEpoch',   type: 'uint256' },  // End epoch (inclusive); 0 = current
    ],
    outputs: [
      {
        name: 'records',
        type: 'tuple[]',
        components: [
          { name: 'epoch',       type: 'uint256' },
          { name: 'timestamp',   type: 'uint256' },
          { name: 'yieldUsdc',   type: 'uint256' },  // Yield harvested (6 dec)
          { name: 'apyBps',      type: 'uint256' },  // Realised APY for that epoch (bps)
          { name: 'totalAum',    type: 'uint256' },  // AUM at time of harvest
        ],
      },
    ],
  },

  // ── Circuit Breaker ──────────────────────────────────────────────────────

  // Whether the circuit breaker has been triggered (USDC depeg or anomaly)
  {
    name: 'isCircuitBreakerActive',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'active', type: 'bool' }],
  },

  // Returns the USDC/USD price used by the circuit breaker (Chainlink feed)
  {
    name: 'getUsdcPrice',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'price',     type: 'int256'  },  // Price with 8 decimals (99950000 = $0.9995)
      { name: 'updatedAt', type: 'uint256' },  // Unix timestamp of last Chainlink update
    ],
  },

  // ── Events ───────────────────────────────────────────────────────────────

  // Fired every 15 minutes when harvest executes
  {
    name: 'YieldHarvested',
    type: 'event',
    inputs: [
      { name: 'epochNumber',    type: 'uint256', indexed: true  },
      { name: 'totalYieldUsdc', type: 'uint256', indexed: false },
      { name: 'blendedApyBps',  type: 'uint256', indexed: false },
      { name: 'timestamp',      type: 'uint256', indexed: false },
    ],
  },

  // Fired when rebalancing shifts capital between adapters
  {
    name: 'Rebalanced',
    type: 'event',
    inputs: [
      { name: 'epochNumber', type: 'uint256', indexed: true  },
      { name: 'fromAdapter', type: 'address', indexed: false },
      { name: 'toAdapter',   type: 'address', indexed: false },
      { name: 'amount',      type: 'uint256', indexed: false },
    ],
  },

  // Fired when circuit breaker triggers
  {
    name: 'CircuitBreakerTriggered',
    type: 'event',
    inputs: [
      { name: 'usdcPrice', type: 'int256',  indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },

] as const

// ── Adapter ABI (shared interface for Aave, Balancer, T-Bills adapters) ──────

export const ADAPTER_ABI = [
  // Current deployed balance in this protocol (in USDC, 6 dec)
  {
    name: 'totalValue',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'value', type: 'uint256' }],
  },
  // Current APY from this protocol (in bps)
  {
    name: 'currentApy',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'apyBps', type: 'uint256' }],
  },
  // Whether an amount can be withdrawn immediately
  {
    name: 'canWithdraw',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [{ name: 'available', type: 'bool' }],
  },
] as const

// ── Liquidity Band enum (mirrors Solidity enum) ───────────────────────────────

export enum LiquidityBand {
  INSTANT = 0,  // Same-block withdrawal — Aave V3 (primary buffer)
  HOURS   = 1,  // 2–8 hour window — Balancer V3, Morpho Blue
  DAYS    = 2,  // 1–3 day redemption — T-Bill tokens
}

export const BAND_LABELS: Record<LiquidityBand, string> = {
  [LiquidityBand.INSTANT]: 'INSTANT',
  [LiquidityBand.HOURS]:   'HOURS',
  [LiquidityBand.DAYS]:    'DAYS',
}

export const BAND_COLORS: Record<LiquidityBand, string> = {
  [LiquidityBand.INSTANT]: '#18C870',  // Green — fastest
  [LiquidityBand.HOURS]:   '#F0A020',  // Amber — medium
  [LiquidityBand.DAYS]:    '#9B6DFF',  // Purple — slowest
}
