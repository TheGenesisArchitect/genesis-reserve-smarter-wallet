export type ProviderOrderStatus = 'PENDING' | 'IN_TRANSIT' | 'SETTLED' | 'FAILED' | 'COMPLIANCE_HOLD';

export interface ProviderCustomerResult {
    providerCustomerId: string;
}

export interface ProviderWalletResult {
    providerWalletId: string;
    address: string;
}

export interface ProviderQuoteResult {
    providerQuoteId: string;
    fxRate: string;
    receiveAmount: string;
    expiresAt: string;
    fees: Record<string, string>;
}

export interface ProviderTransferResult {
    providerTransferId: string;
    status: ProviderOrderStatus;
}

export interface ProviderTransferStatusResult {
    status: ProviderOrderStatus;
    providerStatus: string;
    settledAt?: string;
    failureReason?: string;
}

export interface RegulatedAssetProvider {
    readonly name: string;

    createCustomer(input: {
        accountId: string;
        externalUserId: string;
        jurisdiction: string;
    }): Promise<ProviderCustomerResult>;

    ensureWallet(input: {
        accountId: string;
        asset: 'USDC' | 'USDT';
        network: 'ARBITRUM';
    }): Promise<ProviderWalletResult>;

    createQuote(input: {
        accountId: string;
        corridor: string;
        sendAmount: string;
        sendCurrency: string;
        receiveCurrency: string;
        senderParticipantCode?: string;
        platformCode?: string;
    }): Promise<ProviderQuoteResult>;

    createTransfer(input: {
        accountId: string;
        providerQuoteId: string;
        beneficiaryRef: string;
        idempotencyKey: string;
        senderParticipantCode?: string;
        beneficiaryParticipantCode?: string;
        platformCode?: string;
        assetAddress?: string;
        metadata?: Record<string, unknown>;
    }): Promise<ProviderTransferResult>;

    getTransferStatus(input: {
        providerTransferId: string;
    }): Promise<ProviderTransferStatusResult>;
}
