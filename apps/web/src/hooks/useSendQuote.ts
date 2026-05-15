import { useQuery } from '@tanstack/react-query'
import { useBFFData } from './useBFFData'
import { SendQuoteResponseSchema } from '../lib/validation'

export interface SendQuoteRequest {
    accountId: string
    recipientAddress: string
    amount: string
    corridor?: string
    payoutMethod?: string
}

export interface SendQuoteResponse {
    quoteId: string
    rate: string
    spread: number
    deliveryEstimate: string
    fee: string
    netAmount: string
    expiresAt: string
    [key: string]: unknown
}

/**
 * useS endQuote - Get a quote for a send operation
 * Query hook - caches for 5 minutes by default
 */
export function useSendQuote(params?: SendQuoteRequest & { enabled?: boolean }) {
    const queryString = params
        ? Object.entries(params)
            .filter(([key]) => key !== 'enabled')
            .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
            .join('&')
        : ''

    return useBFFData<SendQuoteResponse>({
        queryKey: ['send-quote', params],
        endpoint: `/api/gr/remittance/quote${queryString ? '?' + queryString : ''}`,
        enabled: params?.enabled !== false && Boolean(params?.accountId && params?.recipientAddress && params?.amount),
        staleTime: 20_000,
        refetchInterval: 30_000,
        schema: SendQuoteResponseSchema,
    })
}
