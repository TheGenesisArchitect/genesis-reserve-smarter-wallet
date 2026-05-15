import axios, { AxiosError } from 'axios';
import { createHmac, randomUUID } from 'crypto';
import { logger } from '../../config/logger';
import {
    ProviderCustomerResult,
    ProviderQuoteResult,
    ProviderTransferResult,
    ProviderTransferStatusResult,
    ProviderWalletResult,
    RegulatedAssetProvider,
} from './provider.types';

export class ZeroHashAdapter implements RegulatedAssetProvider {
    readonly name = 'ZERO_HASH';

    private readonly apiBaseUrl: string;
    private readonly apiKey: string;
    private readonly apiSecret: string;
    private readonly passphrase: string;

    constructor() {
        this.apiBaseUrl = process.env.ZEROHASH_API_BASE_URL || '';
        this.apiKey = process.env.ZEROHASH_API_KEY || '';
        this.apiSecret = process.env.ZEROHASH_API_SECRET || '';
        this.passphrase = process.env.ZEROHASH_API_PASSPHRASE || '';
    }

    private assertConfigured() {
        if (!this.apiBaseUrl || !this.apiKey || !this.apiSecret || !this.passphrase) {
            throw new Error('Zero Hash not configured: set ZEROHASH_API_BASE_URL, ZEROHASH_API_KEY, ZEROHASH_API_SECRET, ZEROHASH_API_PASSPHRASE');
        }
    }

    private decodeSecret(secret: string): Buffer {
        try {
            const decoded = Buffer.from(secret, 'base64');
            if (decoded.length > 0 && Buffer.from(decoded.toString('base64'), 'base64').equals(decoded)) {
                return decoded;
            }
        } catch (_e) {}

        return Buffer.from(secret, 'utf8');
    }

    private buildSignature(params: {
        method: 'GET' | 'POST';
        route: string;
        body: string;
        timestamp: string;
    }): string {
        const prehash = `${params.timestamp}${params.method}${params.route}${params.body}`;
        const digest = createHmac('sha256', this.decodeSecret(this.apiSecret))
            .update(prehash)
            .digest('base64');
        return digest;
    }

    private signedHeaders(params: {
        method: 'GET' | 'POST';
        route: string;
        body: string;
        requestId?: string;
    }): Record<string, string> {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const requestId = params.requestId || randomUUID();
        const signature = this.buildSignature({
            method: params.method,
            route: params.route,
            body: params.body,
            timestamp,
        });

        return {
            'content-type': 'application/json',
            accept: 'application/json',
            'X-REQUEST-ID': requestId,
            'X-SCX-API-KEY': this.apiKey,
            'X-SCX-PASSPHRASE': this.passphrase,
            'X-SCX-TIMESTAMP': timestamp,
            'X-SCX-SIGNED': signature,
        };
    }

    private buildRoute(path: string, queryParams?: Record<string, string>): string {
        const route = new URL(path, this.apiBaseUrl);
        if (queryParams) {
            Object.entries(queryParams).forEach(([key, value]) => route.searchParams.set(key, value));
        }
        return `${route.pathname}${route.search}`;
    }

    async createCustomer(input: {
        accountId: string;
        externalUserId: string;
        jurisdiction: string;
    }): Promise<ProviderCustomerResult> {
        this.assertConfigured();

        logger.info({ accountId: input.accountId }, 'Zero Hash createCustomer (Sender) requested');

        // Zero Hash Remittances — Tier 1 sender submission
        // Docs: POST /participants/customers/new
        const route = this.buildRoute('/participants/customers/new');
        const payload = {
            external_id: input.externalUserId,
            jurisdiction_code: input.jurisdiction,
            partial: true,
        };

        const response = await axios.post(
            `${this.apiBaseUrl}${route}`,
            payload,
            {
                headers: this.signedHeaders({
                    method: 'POST',
                    route,
                    body: JSON.stringify(payload),
                }),
                timeout: 15000,
            }
        );

        // Zero Hash returns participant_code as the persistent identifier
        const providerCustomerId =
            response.data?.participant_code ||
            response.data?.id ||
            response.data?.customerId;
        if (!providerCustomerId) throw new Error('Zero Hash createCustomer missing participant_code');

        return { providerCustomerId: String(providerCustomerId) };
    }

    async ensureWallet(input: {
        accountId: string;
        asset: 'USDC' | 'USDT';
        network: 'ARBITRUM';
    }): Promise<ProviderWalletResult> {
        this.assertConfigured();

        logger.info({ accountId: input.accountId, asset: input.asset }, 'Zero Hash ensureWallet requested');

        const route = this.buildRoute('/wallets');
        const payload = {
            asset: input.asset,
            network: input.network,
        };

        const response = await axios.post(
            `${this.apiBaseUrl}${route}`,
            payload,
            {
                headers: this.signedHeaders({
                    method: 'POST',
                    route,
                    body: JSON.stringify(payload),
                }),
                timeout: 15000,
            }
        );

        const providerWalletId = response.data?.id || response.data?.walletId;
        const address = response.data?.address;

        if (!providerWalletId || !address) {
            throw new Error('Zero Hash ensureWallet missing wallet id or address');
        }

        return {
            providerWalletId: String(providerWalletId),
            address: String(address),
        };
    }

    async createQuote(input: {
        accountId: string;
        corridor: string;
        sendAmount: string;
        sendCurrency: string;
        receiveCurrency: string;
        senderParticipantCode?: string;
        platformCode?: string;
    }): Promise<ProviderQuoteResult> {
        this.assertConfigured();

        logger.info({ accountId: input.accountId, corridor: input.corridor }, 'Zero Hash RFQ requested');

        // Zero Hash Remittances step 7 — POST /liquidity/rfq
        // Docs: https://docs.zerohash.com/reference/post_liquidity-rfq
        const route = this.buildRoute('/liquidity/rfq');
        const payload: Record<string, unknown> = {
            participant_code: input.senderParticipantCode || input.accountId,
            side: 'buy',
            underlying: 'USDC',
            quoted_currency: input.sendCurrency,
            total: input.sendAmount,
        };

        const rfqResponse = await axios.post(
            `${this.apiBaseUrl}${route}`,
            payload,
            {
                headers: this.signedHeaders({
                    method: 'POST',
                    route,
                    body: JSON.stringify(payload),
                }),
                timeout: 15000,
            }
        );

        const rfq = rfqResponse.data || {};
        const quoteId: string = String(rfq.quote_id || rfq.id || '');

        if (!quoteId) throw new Error('Zero Hash RFQ returned no quote_id');

        // Auto-execute the quote (step 7b — POST /liquidity/execute)
        const execRoute = this.buildRoute('/liquidity/execute');
        const execPayload = { quote_id: quoteId };

        const execResponse = await axios.post(
            `${this.apiBaseUrl}${execRoute}`,
            execPayload,
            {
                headers: this.signedHeaders({
                    method: 'POST',
                    route: execRoute,
                    body: JSON.stringify(execPayload),
                }),
                timeout: 15000,
            }
        );

        const exec = execResponse.data || {};

        return {
            // Use the trade_id as the providerQuoteId so Transfer step can reference it
            providerQuoteId: String(exec.trade_id || quoteId),
            fxRate: String(rfq.price || rfq.fxRate || '1'),
            receiveAmount: String(rfq.quantity || rfq.receiveAmount || input.sendAmount),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            fees: {
                spread_notional: String(rfq.spread_notional || '0'),
                spread_bps: String(rfq.spread_bps || '0'),
            },
        };
    }

    async createTransfer(input: {
        accountId: string;
        providerQuoteId: string;
        beneficiaryRef: string;
        idempotencyKey: string;
        // Zero Hash Travel Rule fields
        senderParticipantCode?: string;
        beneficiaryParticipantCode?: string;
        platformCode?: string;
        assetAddress?: string;
        metadata?: Record<string, unknown>;
    }): Promise<ProviderTransferResult> {
        this.assertConfigured();

        logger.info({ accountId: input.accountId, providerQuoteId: input.providerQuoteId }, 'Zero Hash createTransfer requested');

        // Zero Hash Remittances step 9 — POST /transfers
        // Moves USDC from Sender account to Platform account (internal ledger)
        // Docs: https://docs.zerohash.com/reference/post_transfers
        const platformCode = input.platformCode || process.env.ZEROHASH_PLATFORM_CODE || '';
        const senderParticipantCode = input.senderParticipantCode || input.accountId;

        const route = this.buildRoute('/transfers');
        const payload: Record<string, unknown> = {
            from_participant_code: senderParticipantCode,
            from_account_group: platformCode,
            to_participant_code: platformCode,
            to_account_group: platformCode,
            asset: 'USDC',
            amount: (input.metadata?.sendAmountUsdc as string) || String(input.providerQuoteId),
            client_transfer_id: input.idempotencyKey,
        };

        try {
            const response = await axios.post(
                `${this.apiBaseUrl}${route}`,
                payload,
                {
                    headers: this.signedHeaders({
                        method: 'POST',
                        route,
                        body: JSON.stringify(payload),
                        requestId: input.idempotencyKey,
                    }),
                    timeout: 15000,
                }
            );

            const transferData = response.data || {};
            const transferId = String(transferData.id || transferData.client_transfer_id || input.idempotencyKey);

            // If beneficiary + withdrawal address provided, submit on-chain withdrawal (step 11)
            if (input.beneficiaryParticipantCode && input.assetAddress) {
                const withdrawalId = await this.submitWithdrawal({
                    platformCode,
                    assetAddress: input.assetAddress,
                    amount: String((input.metadata?.sendAmountUsdc as string) || ''),
                    senderParticipantCode,
                    beneficiaryParticipantCode: input.beneficiaryParticipantCode,
                    idempotencyKey: `${input.idempotencyKey}-wd`,
                });

                return {
                    providerTransferId: withdrawalId || transferId,
                    status: 'IN_TRANSIT',
                };
            }

            return {
                providerTransferId: transferId,
                status: this.mapProviderStatus(String(transferData.status || 'approved')).status,
            };
        } catch (error) {
            const axiosError = error as AxiosError;
            const isTimeoutOrNetwork = axios.isAxiosError(axiosError) && (!axiosError.response || axiosError.code === 'ECONNABORTED');

            if (isTimeoutOrNetwork) {
                logger.warn(
                    { idempotencyKey: input.idempotencyKey, err: axiosError.message },
                    'Zero Hash transfer request uncertain; attempting idempotent recovery via GET /transfers'
                );

                const recoveredTransferId = await this.findTransferByClientTransferId(input.idempotencyKey);
                if (recoveredTransferId) {
                    return {
                        providerTransferId: recoveredTransferId,
                        status: 'IN_TRANSIT',
                    };
                }
            }

            throw error;
        }
    }

    // Zero Hash step 11 — POST /withdrawals/requests
    // Moves Remittance Token on-chain to the beneficiary's address.
    private async submitWithdrawal(input: {
        platformCode: string;
        assetAddress: string;
        amount: string;
        senderParticipantCode: string;
        beneficiaryParticipantCode: string;
        idempotencyKey: string;
    }): Promise<string | null> {
        const route = this.buildRoute('/withdrawals/requests');
        const payload: Record<string, unknown> = {
            address: input.assetAddress,
            participant_code: input.platformCode,
            amount: input.amount,
            asset: 'USDC',
            account_group: input.platformCode,
            sender_participant_code: input.senderParticipantCode,
            beneficiary_participant_code: input.beneficiaryParticipantCode,
            client_withdrawal_request_id: input.idempotencyKey,
        };

        const response = await axios.post(
            `${this.apiBaseUrl}${route}`,
            payload,
            {
                headers: this.signedHeaders({
                    method: 'POST',
                    route,
                    body: JSON.stringify(payload),
                    requestId: input.idempotencyKey,
                }),
                timeout: 15000,
            }
        ).catch((err: AxiosError) => {
            logger.error({ err: err.message, route }, 'Zero Hash withdrawal request failed');
            return null;
        });

        if (!response) return null;

        const msg = (response.data?.message || response.data || {}) as Record<string, unknown>;
        return String(msg.id || msg.withdrawal_request_id || '');
    }

    async getTransferStatus(input: {
        providerTransferId: string;
    }): Promise<ProviderTransferStatusResult> {
        this.assertConfigured();

        const route = this.buildRoute(`/transfers/${encodeURIComponent(input.providerTransferId)}`);
        const response = await axios.get(
            `${this.apiBaseUrl}${route}`,
            {
                headers: this.signedHeaders({
                    method: 'GET',
                    route,
                    body: '{}',
                }),
                timeout: 15000,
            }
        );

        const payload = response.data || {};
        const providerStatus = String(payload.status || 'pending').toLowerCase();
        const mapped = this.mapProviderStatus(providerStatus);

        return {
            status: mapped.status,
            providerStatus,
            settledAt: payload.settledAt ? String(payload.settledAt) : undefined,
            failureReason: payload.failureReason ? String(payload.failureReason) : undefined,
        };
    }

    private async findTransferByClientTransferId(clientTransferId: string): Promise<string | null> {
        const route = this.buildRoute('/transfers', { client_transfer_id: clientTransferId });

        const response = await axios.get(
            `${this.apiBaseUrl}${route}`,
            {
                headers: this.signedHeaders({
                    method: 'GET',
                    route,
                    body: '{}',
                    requestId: clientTransferId,
                }),
                timeout: 15000,
            }
        );

        const data = response.data;
        if (Array.isArray(data) && data[0]) {
            return String(data[0].id || data[0].transferId || '');
        }
        if (Array.isArray(data?.message) && data.message[0]) {
            return String(data.message[0].id || data.message[0].transferId || '');
        }
        if (data?.id || data?.transferId) {
            return String(data.id || data.transferId);
        }

        return null;
    }

    private mapProviderStatus(providerStatus: string): { status: ProviderTransferStatusResult['status'] } {
        const normalized = providerStatus.toLowerCase();

        if (normalized === 'completed' || normalized === 'settled' || normalized === 'confirmed') {
            return { status: 'SETTLED' };
        }

        if (normalized === 'rejected' || normalized === 'pending_approval' || normalized === 'compliance_hold') {
            return { status: 'COMPLIANCE_HOLD' };
        }

        if (normalized === 'failed' || normalized === 'canceled' || normalized === 'cancelled') {
            return { status: 'FAILED' };
        }

        if (normalized === 'pending' || normalized === 'approved' || normalized === 'submitted') {
            return { status: 'PENDING' };
        }

        return { status: 'IN_TRANSIT' };
    }
}
