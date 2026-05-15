// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/src/abis/vault.abi.ts
//
// GenesisVault.sol ABI — ERC-4626 + Genesis reserve/finalize extensions
// Subset covering all frontend-facing interactions
// ─────────────────────────────────────────────────────────────────────────────

export const GENESIS_VAULT_ABI = [
  // ── ERC-4626 Standard ──────────────────────────────────────────────────────

  // Convert share amount to underlying USDC (current price per share)
  {
    name: 'previewRedeem',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ name: 'assets', type: 'uint256' }],
  },

  // Convert USDC amount to shares
  {
    name: 'previewDeposit',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'assets', type: 'uint256' }],
    outputs: [{ name: 'shares', type: 'uint256' }],
  },

  // Deposit USDC → receive vault shares (triggers yield routing)
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assets', type: 'uint256' },   // USDC amount (6 decimals)
      { name: 'receiver', type: 'address' },  // Who receives the shares
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
  },

  // Withdraw USDC by burning shares
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assets', type: 'uint256' },   // USDC to withdraw
      { name: 'receiver', type: 'address' },  // Who receives USDC
      { name: 'owner', type: 'address' },     // Who owns the shares
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
  },

  // Total USDC under management (liquid + deployed + reserved)
  {
    name: 'totalAssets',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'totalManagedAssets', type: 'uint256' }],
  },

  // User's share balance
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },

  // Convert user's shares to USDC value (balanceOf → maxWithdraw)
  {
    name: 'maxWithdraw',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: 'maxAssets', type: 'uint256' }],
  },

  // Total vault share supply
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'supply', type: 'uint256' }],
  },

  // ── Genesis Extensions: Payment Flow ──────────────────────────────────────

  // Lock funds for outgoing payment with 24hr TTL
  // Caller must be OPERATOR_ROLE (Genesis API gateway)
  {
    name: 'reserveFunds',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'account', type: 'address' },   // Source account
      { name: 'amount', type: 'uint256' },    // USDC to reserve
      { name: 'expiry', type: 'uint256' },    // Unix timestamp (block.timestamp + 86400)
      { name: 'orderId', type: 'bytes32' },   // Idempotency key
    ],
    outputs: [{ name: 'reservationId', type: 'bytes32' }],
  },

  // Execute reserved payment (deducts 0.42% fee, releases to recipient)
  {
    name: 'finalizePayment',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'reservationId', type: 'bytes32' },
      { name: 'recipient', type: 'address' },
    ],
    outputs: [],
  },

  // Cancel reservation and return funds to account
  {
    name: 'cancelReservation',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'reservationId', type: 'bytes32' }],
    outputs: [],
  },

  // ── Events ─────────────────────────────────────────────────────────────────

  {
    name: 'Deposit',
    type: 'event',
    inputs: [
      { name: 'sender', type: 'address', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'assets', type: 'uint256', indexed: false },
      { name: 'shares', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Withdraw',
    type: 'event',
    inputs: [
      { name: 'sender', type: 'address', indexed: true },
      { name: 'receiver', type: 'address', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'assets', type: 'uint256', indexed: false },
      { name: 'shares', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'FundsReserved',
    type: 'event',
    inputs: [
      { name: 'reservationId', type: 'bytes32', indexed: true },
      { name: 'account', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'expiry', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'PaymentFinalized',
    type: 'event',
    inputs: [
      { name: 'reservationId', type: 'bytes32', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'netAmount', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
    ],
  },
] as const

// ── ComplianceRegistry ABI ─────────────────────────────────────────────────────
// Uses the public `records` mapping getter (Solidity auto-generates this).
// `getKYCTier` is not a named function in the deployed contract.
// `blocklist` is a nested mapping — read `records.sanctionStatus` for block state.

export const COMPLIANCE_REGISTRY_ABI = [
  {
    // Public mapping getter: records(address) → ComplianceRecord struct tuple
    name: 'records',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [
      { name: 'kycLevel',           type: 'uint8'   },
      { name: 'riskTier',           type: 'uint8'   },
      { name: 'sanctionStatus',     type: 'bytes32' },
      { name: 'amlStatus',          type: 'bytes32' },
      { name: 'jurisdiction',       type: 'string'  },
      { name: 'pepFlag',            type: 'bool'    },
      { name: 'travelRuleRequired', type: 'bool'    },
      { name: 'active',             type: 'bool'    },
      { name: 'kycExpiry',          type: 'uint64'  },
      { name: 'lastScreening',      type: 'uint64'  },
      { name: 'dailyVolumeUsed',    type: 'uint256' },
      { name: 'dailyVolumeReset',   type: 'uint256' },
      { name: 'kycProviderRef',     type: 'bytes32' },
      { name: 'amlProviderRef',     type: 'bytes32' },
    ],
  },
] as const

// ── USDC ABI (ERC-20 + Permit2 approve) ───────────────────────────────────────

export const USDC_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: 'remaining', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
] as const
