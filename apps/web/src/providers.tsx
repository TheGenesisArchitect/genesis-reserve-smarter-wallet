'use client'

import { type ReactNode, useState, useEffect, Component, type ErrorInfo } from 'react'
import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider as PrivyWagmiProvider } from '@privy-io/wagmi'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PRIVY_CONFIG } from './config/privy.config'
import { wagmiConfig } from './config/wagmi.config'

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID
const PRIVY_ID_VALID = typeof PRIVY_APP_ID === 'string' && PRIVY_APP_ID.length > 0

interface Props {
  children: ReactNode
}

/* ── Error boundary ─────────────────────────────────────────────────────────
   Catches synchronous throws from PrivyProvider (e.g. invalid App ID).
   Must be a class component — function components cannot be error boundaries.
*/
class PrivyErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[GenesisProviders] Privy init failed:', error.message, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#020305', fontFamily: "'Tenor Sans', sans-serif",
          padding: '0 24px',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
            boxShadow: '0 0 0 1px rgba(201,168,76,0.15), 0 0 20px rgba(201,168,76,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
          }}>
            <img
              src="/genesis-logo.png"
              width={64}
              height={64}
              alt="Genesis Reserve"
              style={{ width: '100%', height: '100%', display: 'block', borderRadius: '50%' }}
            />
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: '#f5f0e8', letterSpacing: '0.22em', marginBottom: 4 }}>GENESIS</div>
          <div style={{ fontSize: 9, letterSpacing: '0.6em', color: '#c9a84c', textTransform: 'uppercase', marginBottom: 32 }}>RESERVE</div>
          <div style={{
            maxWidth: 380, padding: '18px 22px', borderRadius: 14,
            background: 'rgba(224,64,64,0.07)', border: '1px solid rgba(224,64,64,0.22)',
            marginBottom: 24, textAlign: 'center',
          }}>
            <div style={{ fontSize: 12, color: '#e05555', marginBottom: 8, letterSpacing: '0.06em' }}>
              WALLET CONNECTION ERROR
            </div>
            <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.55)', lineHeight: 1.7 }}>
              {(this.state.error as Error).message}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.3)', marginTop: 12, lineHeight: 1.6 }}>
              Check <code style={{ color: '#c9a84c', fontSize: 11 }}>NEXT_PUBLIC_PRIVY_APP_ID</code> in{' '}
              <code style={{ color: '#c9a84c', fontSize: 11 }}>.env.local</code> matches your Privy dashboard.
            </div>
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 28px', borderRadius: 24, background: '#c9a84c',
              color: '#1a1400', border: 'none', cursor: 'pointer',
              fontSize: 12, letterSpacing: '0.1em', marginBottom: 10,
            }}
          >
            Retry
          </button>
          <button
            onClick={() => { sessionStorage.setItem('gr_force_preview', '1'); window.location.reload() }}
            style={{
              padding: '9px 24px', borderRadius: 24, background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(245,240,232,0.4)', cursor: 'pointer', fontSize: 11,
              letterSpacing: '0.06em',
            }}
          >
            Continue in Preview Mode
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export function GenesisProviders({ children }: Props) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: 0 },
        },
      })
  )

  // Gate Privy on client mount only — PrivyProvider throws during SSR.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // QueryClientProvider is outermost: @privy-io/react-auth@1.99 renders wagmi
  // internally (inside modal-context) before reaching children, so useMutation
  // must find a QueryClient before PrivyProvider mounts.
  return (
    <QueryClientProvider client={queryClient}>
      {mounted && PRIVY_ID_VALID ? (
        <PrivyErrorBoundary>
          <PrivyProvider appId={PRIVY_APP_ID!} config={PRIVY_CONFIG}>
            <PrivyWagmiProvider config={wagmiConfig} reconnectOnMount={false}>
              {children}
            </PrivyWagmiProvider>
          </PrivyProvider>
        </PrivyErrorBoundary>
      ) : (
        <WagmiProvider config={wagmiConfig} reconnectOnMount>
          {children}
        </WagmiProvider>
      )}
    </QueryClientProvider>
  )
}
