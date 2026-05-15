import { NextResponse } from 'next/server'
import { ACTIVE_CHAIN, ACTIVE_CONTRACTS } from '../../../../config/contracts'
import { backendGet, isBackendConfigured } from '../_lib/backend'
import type { SettingsResponse } from '../../../../lib/bff.types'

const walletAddressPattern = /^0x[a-fA-F0-9]{40}$/

async function getBackendStatus() {
    if (!isBackendConfigured()) {
        return { bundler: 'DEGRADED', paymaster: 'DEGRADED', rpc: 'DEGRADED' } as const
    }

    try {
        const upstream = await backendGet('/ready')
        if (!upstream.ok) {
            return { bundler: 'DEGRADED', paymaster: 'DEGRADED', rpc: 'DEGRADED' } as const
        }
        return { bundler: 'ONLINE', paymaster: 'ONLINE', rpc: 'ONLINE' } as const
    } catch {
        return { bundler: 'DEGRADED', paymaster: 'DEGRADED', rpc: 'DEGRADED' } as const
    }
}

function getOptionalContractAddress(key: 'AAVE_V3_ADAPTER' | 'BALANCER_V3_ADAPTER' | 'TBILL_ADAPTER') {
    if (key in ACTIVE_CONTRACTS) {
        return ACTIVE_CONTRACTS[key as keyof typeof ACTIVE_CONTRACTS]
    }
    return '0x0000000000000000000000000000000000000000'
}

function isConfiguredAddress(address: string) {
    return /^0x[a-fA-F0-9]{40}$/.test(address) && address !== '0x0000000000000000000000000000000000000000'
}

export async function GET(request: Request) {
    const search = new URL(request.url).searchParams
    const walletAddress = search.get('walletAddress')

    if (!walletAddress) {
        return NextResponse.json({ error: 'missing_wallet_address', detail: 'Provide walletAddress query parameter.' }, { status: 400 })
    }

    if (!walletAddressPattern.test(walletAddress)) {
        return NextResponse.json({ error: 'invalid_wallet_address', detail: 'walletAddress must be a valid EVM address.' }, { status: 400 })
    }

    const status = await getBackendStatus()

    const response: SettingsResponse = {
        walletAddress,
        contracts: [
            { name: 'GenesisVault.sol', address: ACTIVE_CONTRACTS.GENESIS_VAULT, network: ACTIVE_CHAIN.name, status: 'LIVE' },
            { name: 'StrategyRouter.sol', address: ACTIVE_CONTRACTS.STRATEGY_ROUTER, network: ACTIVE_CHAIN.name, status: 'LIVE' },
            { name: 'ComplianceRegistry.sol', address: ACTIVE_CONTRACTS.COMPLIANCE_REGISTRY, network: ACTIVE_CHAIN.name, status: 'LIVE' },
            {
                name: 'AaveV3Adapter.sol',
                address: getOptionalContractAddress('AAVE_V3_ADAPTER'),
                network: ACTIVE_CHAIN.name,
                status: isConfiguredAddress(getOptionalContractAddress('AAVE_V3_ADAPTER')) ? 'LIVE' : 'OFFLINE',
            },
            {
                name: 'BalancerV3Adapter.sol',
                address: getOptionalContractAddress('BALANCER_V3_ADAPTER'),
                network: ACTIVE_CHAIN.name,
                status: isConfiguredAddress(getOptionalContractAddress('BALANCER_V3_ADAPTER')) ? 'LIVE' : 'OFFLINE',
            },
            {
                name: 'TbillAdapter.sol',
                address: getOptionalContractAddress('TBILL_ADAPTER'),
                network: ACTIVE_CHAIN.name,
                status: isConfiguredAddress(getOptionalContractAddress('TBILL_ADAPTER')) ? 'LIVE' : 'OFFLINE',
            },
        ],
        apiKey: {
            label: 'Partner API Key',
            maskedKey: 'gr_live_••••••••••••_9f3a',
            lastRotatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        },
        network: {
            network: ACTIVE_CHAIN.name,
            chainId: ACTIVE_CHAIN.id,
            bundler: status.bundler,
            paymaster: status.paymaster,
            rpc: status.rpc,
        },
        fetchedAt: new Date().toISOString(),
    }

    return NextResponse.json(response, {
        headers: {
            'cache-control': 'private, max-age=60',
        },
    })
}
