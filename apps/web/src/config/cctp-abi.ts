// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/src/config/cctp-abi.ts
//
// Minimal ABI fragments for CCTP v2 on-chain contracts.
// TokenMessenger  — burn USDC on source chain
// MessageTransmitter — receive + mint USDC on destination chain
// USDC_APPROVE    — approve TokenMessenger allowance
// ─────────────────────────────────────────────────────────────────────────────

// ── TokenMessenger ────────────────────────────────────────────────────────────
export const TOKEN_MESSENGER_ABI = [
    // Standard burn (no caller restriction)
    {
        name: 'depositForBurn',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'amount', type: 'uint256' },
            { name: 'destinationDomain', type: 'uint32' },
            { name: 'mintRecipient', type: 'bytes32' },
            { name: 'burnToken', type: 'address' },
        ],
        outputs: [{ name: 'nonce', type: 'uint64' }],
    },
    // v2: burn with caller restriction + fast-finality threshold
    {
        name: 'depositForBurnWithCaller',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'amount', type: 'uint256' },
            { name: 'destinationDomain', type: 'uint32' },
            { name: 'mintRecipient', type: 'bytes32' },
            { name: 'burnToken', type: 'address' },
            { name: 'destinationCaller', type: 'bytes32' },
            { name: 'minFinalityThreshold', type: 'uint256' },
        ],
        outputs: [{ name: 'nonce', type: 'uint64' }],
    },
    // Event emitted on every successful burn
    {
        name: 'DepositForBurn',
        type: 'event',
        inputs: [
            { name: 'nonce', type: 'uint64', indexed: false },
            { name: 'burnToken', type: 'address', indexed: true },
            { name: 'amount', type: 'uint256', indexed: false },
            { name: 'depositor', type: 'address', indexed: true },
            { name: 'mintRecipient', type: 'bytes32', indexed: false },
            { name: 'destinationDomain', type: 'uint32', indexed: false },
            { name: 'destinationTokenMessenger', type: 'bytes32', indexed: false },
            { name: 'destinationCaller', type: 'bytes32', indexed: false },
        ],
    },
] as const

// ── MessageTransmitter ────────────────────────────────────────────────────────
export const MESSAGE_TRANSMITTER_ABI = [
    // Called by relayer on destination chain to mint USDC
    {
        name: 'receiveMessage',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'message', type: 'bytes' },
            { name: 'attestation', type: 'bytes' },
        ],
        outputs: [{ name: 'success', type: 'bool' }],
    },
    // Event emitted when message is successfully received
    {
        name: 'MessageReceived',
        type: 'event',
        inputs: [
            { name: 'caller', type: 'address', indexed: false },
            { name: 'sourceDomain', type: 'uint32', indexed: false },
            { name: 'nonce', type: 'uint64', indexed: true },
            { name: 'sender', type: 'bytes32', indexed: false },
            { name: 'messageBody', type: 'bytes', indexed: false },
        ],
    },
    // MessageSent emitted by source chain — body decoded to get attestation key
    {
        name: 'MessageSent',
        type: 'event',
        inputs: [
            { name: 'message', type: 'bytes', indexed: false },
        ],
    },
] as const

// ── USDC minimal ABI (approve + read) ────────────────────────────────────────
export const USDC_APPROVE_ABI = [
    {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
    },
    {
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
        ],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
] as const
