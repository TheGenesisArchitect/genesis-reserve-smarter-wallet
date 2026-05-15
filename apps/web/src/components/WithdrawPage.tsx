'use client'

import { useAccount } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import type { ViewKey } from './AppShell'
import { WithdrawFlow } from './WithdrawFlow'

interface WithdrawPageProps {
    onNavigate?: (v: ViewKey) => void
}

export function WithdrawPage({ onNavigate }: WithdrawPageProps) {
    const { address } = useAccount()
    const { user } = usePrivy()

    const walletAddress = address ?? (user?.wallet?.address as `0x${string}` | undefined)

    return (
        <div style={{ padding: '32px 32px 48px', maxWidth: 760, margin: '0 auto', fontFamily: "'Tenor Sans', sans-serif" }}>
            <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 10, letterSpacing: '0.18em', color: 'rgba(245,240,232,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>
                    Treasury Operations
                </div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 300, color: '#f5f0e8', letterSpacing: '0.04em', marginBottom: 6 }}>
                    Withdraw
                </div>
                <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.42)' }}>
                    Build a strategy-aware withdraw plan before execution. Only the amount you enter is removed from yield allocation.
                </div>
            </div>

            <WithdrawFlow walletAddress={walletAddress} onNavigate={onNavigate} />
        </div>
    )
}
