import { NextResponse } from 'next/server'
import { backendPost, isBackendConfigured } from '../_lib/backend'

function unwrapDataEnvelope(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== 'object') return {}
    const maybeRecord = payload as Record<string, unknown>
    const data = maybeRecord.data
    if (data && typeof data === 'object') return data as Record<string, unknown>
    return maybeRecord
}

function extractAccountId(data: Record<string, unknown>): string | null {
    const candidates = [data.accountId, data.activeAccountId, data.account_id, data.id]
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.length > 0) {
            return candidate
        }
    }
    return null
}

const walletAddressPattern = /^0x[a-fA-F0-9]{40}$/

function walletFallbackResponse(accountId: string) {
    return NextResponse.json(
        {
            accounts: [
                {
                    accountId,
                    label: 'Primary Wallet',
                    mode: 'wallet',
                },
            ],
            activeAccountId: accountId,
            fetchedAt: new Date().toISOString(),
            source: 'wallet-fallback',
        },
        {
            status: 200,
            headers: {
                'cache-control': 'private, max-age=30',
            },
        }
    )
}

export async function GET(request: Request) {
    const search = new URL(request.url).searchParams
    const walletAddress = search.get('walletAddress')?.toLowerCase()
    const smartAccountAddress = search.get('smartAccountAddress')?.toLowerCase()
    const embeddedWalletAddress = walletAddress || smartAccountAddress

    if (!embeddedWalletAddress) {
        return NextResponse.json(
            { error: 'missing_wallet_address', detail: 'Provide walletAddress or smartAccountAddress query parameter.' },
            { status: 400 }
        )
    }

    if (walletAddress && !walletAddressPattern.test(walletAddress)) {
        return NextResponse.json(
            { error: 'invalid_wallet_address', detail: 'walletAddress must be a valid EVM address.' },
            { status: 400 }
        )
    }

    if (smartAccountAddress && !walletAddressPattern.test(smartAccountAddress)) {
        return NextResponse.json(
            { error: 'invalid_smart_account_address', detail: 'smartAccountAddress must be a valid EVM address.' },
            { status: 400 }
        )
    }

    if (!isBackendConfigured()) {
        return walletFallbackResponse(embeddedWalletAddress)
    }

    try {
        const idempotencyKey = `activate-${embeddedWalletAddress}`
        const upstream = await backendPost(
            '/v1/wallets/register',
            {
                embeddedWalletAddress,
                smartAccountAddress: smartAccountAddress || undefined,
                chainId: 42161,
                country: 'US',
                jurisdiction: 'US',
            },
            idempotencyKey,
            request,
            {
                'x-wallet-address': embeddedWalletAddress,
                'x-smart-account-address': smartAccountAddress?.toLowerCase(),
                'x-privy-user-id': embeddedWalletAddress,
                'x-privy-login-method': 'wallet',
            }
        )

        const rawPayload = await upstream.text()
        let payload: unknown = {}

        try {
            payload = rawPayload ? JSON.parse(rawPayload) : {}
        } catch {
            payload = { detail: rawPayload }
        }

        if (!upstream.ok) {
            if (upstream.status === 404 || upstream.status === 405 || upstream.status === 501 || upstream.status >= 500) {
                return walletFallbackResponse(embeddedWalletAddress)
            }

            return NextResponse.json(payload, { status: upstream.status })
        }

        const account = unwrapDataEnvelope(payload)
        const accountId = extractAccountId(account)

        if (!accountId) {
            return NextResponse.json(
                {
                    error: 'invalid_account_payload',
                    detail: 'Account activation response did not include accountId.',
                },
                { status: 502 }
            )
        }

        return NextResponse.json(
            {
                accounts: [
                    {
                        accountId,
                        label: `Primary ${accountId}`,
                        mode: account.mode,
                    },
                ],
                activeAccountId: accountId,
                fetchedAt: new Date().toISOString(),
            },
            {
                status: 200,
                headers: {
                    'cache-control': 'private, max-age=30',
                },
            }
        )
    } catch (error) {
        return walletFallbackResponse(embeddedWalletAddress)
    }
}
