import { NextResponse } from 'next/server'
import { createPublicClient, http, isAddress } from 'viem'
import { arbitrum } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { CONTRACTS } from '../../../../../config/contracts'

const RPC_URL = process.env.ARBITRUM_RPC_URL
    || process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL
    || 'https://arb1.arbitrum.io/rpc'

const GENESIS_VAULT    = CONTRACTS.GENESIS_VAULT
const STRATEGY_ROUTER  = CONTRACTS.STRATEGY_ROUTER

// keccak256("VAULT_ROLE") — the role that controls harvest() on StrategyRouter
const VAULT_ROLE     = '0x31e0210044b4f6757ce6aa31f9c6e8d4896d24a755014887391a926c5224d959' as const
// keccak256("HARVESTER_ROLE") — alternative harvest role
const HARVESTER_ROLE = '0x3fc733b4d20d27a28452ddf0e9351aced28242fe03389a653cdb783955316b9b' as const
// keccak256("OPERATOR_ROLE") — controls activateAccount on GenesisVault
const OPERATOR_ROLE  = '0x97667070c54ef182b0f5858b034beac1b6f3089aa2d3188bb1e8929f4fa9b929' as const

const HAS_ROLE_ABI = [
    {
        name: 'hasRole',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'role', type: 'bytes32' },
            { name: 'account', type: 'address' },
        ],
        outputs: [{ name: '', type: 'bool' }],
    },
] as const

const CIRCUIT_BREAKER_ABI = [
    {
        name: 'isCircuitBreakerActive',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: 'active', type: 'bool' }],
    },
] as const

function maskAddress(addr: string): string {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export async function GET() {
    try {
        // Resolve operator address from env — prefer explicit address over deriving from key
        const explicitAddress = (process.env.GENESIS_VAULT_OPERATOR_ADDRESS || '').trim()
        const privateKey = (
            process.env.GENESIS_VAULT_OPERATOR_PRIVATE_KEY
            || process.env.GENESIS_OPERATOR_PRIVATE_KEY
            || ''
        ).trim()

        let operatorAddress: `0x${string}` | null = null

        if (isAddress(explicitAddress)) {
            operatorAddress = explicitAddress as `0x${string}`
        } else if (privateKey.startsWith('0x') && privateKey.length === 66) {
            try {
                operatorAddress = privateKeyToAccount(privateKey as `0x${string}`).address
            } catch {
                // malformed key
            }
        }

        if (!operatorAddress) {
            return NextResponse.json({
                configured: false,
                detail: 'No GENESIS_VAULT_OPERATOR_ADDRESS or valid GENESIS_VAULT_OPERATOR_PRIVATE_KEY found in environment',
            }, { status: 200 })
        }

        const client = createPublicClient({ chain: arbitrum, transport: http(RPC_URL) })

        const [
            vaultOperatorRole,
            routerVaultRole,
            routerHarvesterRole,
            circuitBreakerActive,
        ] = await Promise.all([
            client.readContract({
                address: GENESIS_VAULT,
                abi: HAS_ROLE_ABI,
                functionName: 'hasRole',
                args: [OPERATOR_ROLE, operatorAddress],
            }) as Promise<boolean>,
            client.readContract({
                address: STRATEGY_ROUTER,
                abi: HAS_ROLE_ABI,
                functionName: 'hasRole',
                args: [VAULT_ROLE, operatorAddress],
            }) as Promise<boolean>,
            client.readContract({
                address: STRATEGY_ROUTER,
                abi: HAS_ROLE_ABI,
                functionName: 'hasRole',
                args: [HARVESTER_ROLE, operatorAddress],
            }) as Promise<boolean>,
            client.readContract({
                address: STRATEGY_ROUTER,
                abi: CIRCUIT_BREAKER_ABI,
                functionName: 'isCircuitBreakerActive',
            }) as Promise<boolean>,
        ])

        const canActivate = vaultOperatorRole
        const canHarvest  = routerVaultRole || routerHarvesterRole

        return NextResponse.json({
            configured: true,
            operatorAddress: maskAddress(operatorAddress),
            roles: {
                vault_OPERATOR_ROLE: vaultOperatorRole,
                router_VAULT_ROLE: routerVaultRole,
                router_HARVESTER_ROLE: routerHarvesterRole,
            },
            capabilities: {
                canActivateAccounts: canActivate,
                canHarvestYield: canHarvest,
            },
            circuitBreakerActive,
            action_needed: !canHarvest
                ? 'Deployer (0x3e435c4dbb4e74119c4267d1f3b8335b31c80a0f) must call grantRole(VAULT_ROLE, <operator>) on StrategyRouter'
                : null,
            contracts: {
                genesisVault: GENESIS_VAULT,
                strategyRouter: STRATEGY_ROUTER,
            },
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
