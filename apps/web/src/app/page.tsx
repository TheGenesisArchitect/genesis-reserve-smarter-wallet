'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { usePrivy } from '@privy-io/react-auth'

import { AppShell, type ViewKey } from '../components/AppShell'
import { WalletHome } from '../components/WalletHome'
import { CardPage } from '../components/CardPage'
import { VaultsPage } from '../components/VaultsPage'
import { DepositPage } from '../components/DepositPage'
import { WithdrawPage } from '@/components/WithdrawPage'
import { ActivityPage } from '../components/ActivityPage'
import { SettingsPanel } from '../components/SettingsPanel'
import { GenesisLandingPage } from '../components/GenesisLandingPage'
import { useAccountResolver } from '../hooks/useAccountResolver'
import { useActiveWalletAddress } from '../hooks/useActiveWalletAddress'
import { useSmartAccount } from '../hooks/useSmartAccount'

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID
const PRIVY_ENABLED = typeof PRIVY_APP_ID === 'string' && PRIVY_APP_ID.length > 0

const SendPage = dynamic(() => import('../components/SendPage').then((mod) => mod.SendPage), { ssr: false })
// RecipientBookPanel is used from within SendPage, not directly in PanelRouter
const ScheduledSendsPanel = dynamic(() => import('../components/ScheduledSendsPanel').then((mod) => mod.ScheduledSendsPanel), { ssr: false })
const BatchOperationsPanel = dynamic(() => import('../components/BatchOperationsPanel').then((mod) => mod.BatchOperationsPanel), { ssr: false })
const ComplianceViewPanel = dynamic(() => import('../components/ComplianceViewPanel').then((mod) => mod.ComplianceViewPanel), { ssr: false })
const AdminConsolePanel = dynamic(() => import('../components/AdminConsolePanel').then((mod) => mod.AdminConsolePanel), { ssr: false })
const AnalyticsDashboard = dynamic(() => import('../components/AnalyticsDashboard').then((mod) => mod.AnalyticsDashboard), { ssr: false })
const YieldMonitorPanel = dynamic(() => import('../components/YieldMonitorPanel').then((mod) => mod.YieldMonitorPanel), { ssr: false })
const ConsultiveForecastPanel = dynamic(() => import('../components/ConsultiveForecastPanel').then((mod) => mod.ConsultiveForecastPanel), { ssr: false })
const AgentUniversePanel = dynamic(() => import('../components/AgentUniversePanel').then((mod) => mod.AgentUniversePanel), { ssr: false })
const CodexAcademyHub = dynamic(() => import('../components/codex/CodexAcademyHub').then((mod) => mod.CodexAcademyHub), { ssr: false })
const BridgePanel = dynamic(() => import('../components/BridgePanel').then((mod) => mod.BridgePanel), { ssr: false })
const SwapPanel = dynamic(() => import('../components/SwapPanel').then((mod) => mod.SwapPanel), { ssr: false })
const ReceiveFlow = dynamic(() => import('../components/ReceiveFlow').then((mod) => mod.ReceiveFlow), { ssr: false })

export default function GenesisDashboardPage() {
  const [forcePreview, setForcePreview] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (sessionStorage.getItem('gr_force_preview')) setForcePreview(true)
  }, [])

  if (PRIVY_ENABLED && !forcePreview && !mounted) return <BootScreen />
  if (forcePreview || !PRIVY_ENABLED) return <GenesisPreviewPage />
  return <GenesisPrivyPage />
}

/* ── Authenticated page ─────────────────────────────────────────────── */
function GenesisPrivyPage() {
  const { ready, authenticated, login, logout } = usePrivy()
  const address = useActiveWalletAddress() as `0x${string}` | undefined
  const [activeView, setActiveView] = useState<ViewKey>('home')
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>()
  const [timedOut, setTimedOut] = useState(false)

  // Guard: only resolve smart account when actually authenticated
  const smartAddress = useConditionalSmartAccount(authenticated)

  const { data: accountsData } = useAccountResolver(address, smartAddress ?? undefined)
  const accounts = accountsData?.accounts ?? []

  useEffect(() => {
    if (!selectedAccountId && accountsData?.activeAccountId) {
      setSelectedAccountId(accountsData.activeAccountId)
    } else if (!selectedAccountId && accounts.length > 0) {
      setSelectedAccountId(accounts[0].accountId)
    } else if (!selectedAccountId && address) {
      // Backend unavailable or account resolver not ready: use wallet address as account identifier.
      setSelectedAccountId(address)
    }
  }, [accountsData, accounts, selectedAccountId, address])

  // Clear account when user logs out
  useEffect(() => {
    if (!authenticated) setSelectedAccountId(undefined)
  }, [authenticated])

  // Bail out to preview mode if Privy doesn't initialize within 10s
  useEffect(() => {
    if (ready) return
    const t = setTimeout(() => setTimedOut(true), 10_000)
    return () => clearTimeout(t)
  }, [ready])

  if (!ready && timedOut) return <PrivyErrorScreen />
  if (!ready) return <BootScreen />
  if (!authenticated) return <GenesisLandingPage onLogin={login} />

  return (
    <AppShell
      activeView={activeView}
      onNavigate={setActiveView}
      authenticated={authenticated}
      address={address}
      onLogin={login}
      onLogout={logout}
    >
      <PanelRouter
        view={activeView}
        onNavigate={setActiveView}
        accountId={selectedAccountId}
        address={address}
      />
    </AppShell>
  )
}

/* Only initialize ZeroDev smart account when user is authenticated AND Privy
   is fully mounted — avoids "called outside PrivyProvider" warnings and
   errors from placeholder bundler/paymaster URLs before keys are configured */
function useConditionalSmartAccount(authenticated: boolean) {
  const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  const privyReady = typeof PRIVY_APP_ID === 'string' && PRIVY_APP_ID.length > 0
  const result = useSmartAccount()
  return (authenticated && privyReady) ? result.smartAddress : null
}

/* ── Preview page (no Privy) ────────────────────────────────────────── */
function GenesisPreviewPage() {
  const [activeView, setActiveView] = useState<ViewKey>('home')
  const selectedAccountId = 'pta-demo'

  return (
    <AppShell
      activeView={activeView}
      onNavigate={setActiveView}
      authenticated={false}
    >
      {/* Preview mode banner */}
      <div style={{
        margin: '14px 20px 0',
        padding: '9px 14px',
        borderRadius: 10,
        border: '1px solid rgba(201,168,76,0.2)',
        background: 'rgba(201,168,76,0.07)',
        color: '#c9a84c',
        fontSize: 11,
        fontFamily: "'Tenor Sans', sans-serif",
        letterSpacing: '0.04em',
      }}>
        Preview mode — Privy not configured. Showing demo data.
      </div>
      <PanelRouter
        view={activeView}
        onNavigate={setActiveView}
        accountId={selectedAccountId}
        address={undefined}
      />
    </AppShell>
  )
}

/* ── Panel router ────────────────────────────────────────────────────── */
function PanelRouter({
  view, onNavigate, accountId, address,
}: {
  view: ViewKey
  onNavigate: (v: ViewKey) => void
  accountId?: string
  address?: `0x${string}`
}) {
  const panelStyle = { padding: '0', minHeight: 'calc(100vh - 50px)' }

  switch (view) {
    case 'home':
      return <WalletHome accountId={accountId} onNavigate={onNavigate} />

    case 'card':
      return <CardPage onNavigate={onNavigate} />

    case 'send':
      return <SendPage accountId={accountId} />

    case 'deposit':
      return <DepositPage onNavigate={onNavigate} />

    case 'withdraw':
      return <WithdrawPage onNavigate={onNavigate} />

    case 'receive':
      return (
        <div style={panelStyle}>
          <ReceiveFlow />
        </div>
      )

    case 'bridge':
      return <BridgePanel onNavigate={onNavigate} />

    case 'swap':
      return <SwapPanel onNavigate={onNavigate} />

    case 'vaults':
      return <VaultsPage onNavigate={onNavigate} accountId={accountId} />

    case 'activity':
      return <ActivityPage accountId={accountId} />

    case 'settings':
      return (
        <div style={panelStyle}>
          <SettingsPanel walletAddress={address} />
          <EnterpriseMoreSection onNavigate={onNavigate} />
        </div>
      )

    case 'agentic': return <div style={panelStyle}><AgentUniversePanel /></div>
    case 'analytics': return <div style={panelStyle}><AnalyticsDashboard accountId={accountId} /></div>
    case 'yield-monitor': return <div style={panelStyle}><YieldMonitorPanel onNavigate={onNavigate as (view: string) => void} /></div>
    case 'compliance': return <div style={panelStyle}><ComplianceViewPanel walletAddress={address} /></div>
    case 'consultive': return <div style={panelStyle}><ConsultiveForecastPanel /></div>
    case 'scheduled': return <div style={panelStyle}><ScheduledSendsPanel accountId={accountId} /></div>
    case 'batch': return <div style={panelStyle}><BatchOperationsPanel accountId={accountId} /></div>
    case 'admin': return <div style={panelStyle}><AdminConsolePanel /></div>
    case 'academy': return <div style={panelStyle}><CodexAcademyHub /></div>

    default:
      return <WalletHome accountId={accountId} onNavigate={onNavigate} />
  }
}

/* ── Enterprise tools tray (under Settings) ────────────────────────── */
const ENTERPRISE_TOOLS: Array<{ key: ViewKey; label: string; desc: string }> = [
  { key: 'agentic', label: 'Agent Universe', desc: 'ML pipeline management & lifecycle' },
  { key: 'analytics', label: 'Analytics', desc: 'ROI, strategy breakdown, risk heatmaps' },
  { key: 'yield-monitor', label: 'Yield Monitor', desc: 'Global APY ranges and promotable strategy alerts' },
  { key: 'compliance', label: 'Compliance', desc: 'KYC / AML status & screening' },
  { key: 'consultive', label: 'Consultive', desc: 'AI forecast & recommendations' },
  { key: 'scheduled', label: 'Scheduled Sends', desc: 'Recurring remittance setup' },
  { key: 'batch', label: 'Batch Operations', desc: 'Multi-recipient bulk sends' },
  { key: 'admin', label: 'Partner Admin', desc: 'Feature flags & partner controls' },
]

function EnterpriseMoreSection({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  return (
    <div style={{ padding: '24px 20px 40px', borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 8 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.2em', color: 'rgba(245,240,232,0.3)', textTransform: 'uppercase', marginBottom: 14, fontFamily: "'Tenor Sans', sans-serif" }}>
        More Tools
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {ENTERPRISE_TOOLS.map(t => (
          <button key={t.key} type="button" onClick={() => onNavigate(t.key)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: 12,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.07)',
              cursor: 'pointer', textAlign: 'left',
              fontFamily: "'Tenor Sans', sans-serif",
            }}
          >
            <div>
              <div style={{ fontSize: 13, color: '#f5f0e8', marginBottom: 2 }}>{t.label}</div>
              <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.38)' }}>{t.desc}</div>
            </div>
            <span style={{ fontSize: 16, color: 'rgba(201,168,76,0.4)', marginLeft: 12 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Boot screen ─────────────────────────────────────────────────────── */
function BootScreen() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1200)
    return () => clearInterval(t)
  }, [])

  const steps = ['Connecting to Privy', 'Loading wallet', 'Preparing vault']
  const currentStep = steps[Math.min(tick, steps.length - 1)]

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#020305',
    }}>
      {/* Logo */}
      <div style={{
        width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
        boxShadow: '0 0 0 1px rgba(201,168,76,0.15), 0 0 24px rgba(201,168,76,0.22), 0 0 52px rgba(201,168,76,0.09)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
      }}>
        <img
          src="/genesis-logo.png"
          width={72}
          height={72}
          alt="Genesis Reserve"
          style={{ width: '100%', height: '100%', display: 'block', borderRadius: '50%' }}
          onError={(e) => {
            const el = e.currentTarget.parentElement!
            el.innerHTML = '<span style="font-size:52px;opacity:.88;color:#c9a84c">◈</span>'
          }}
        />
      </div>
      <div style={{
        fontFamily: "'Cormorant Garamond', serif",
        fontSize: 28, fontWeight: 300,
        color: '#f5f0e8', letterSpacing: '0.28em',
        lineHeight: 1, marginBottom: 4,
      }}>GENESIS</div>
      <div style={{
        fontFamily: "'Tenor Sans', sans-serif",
        fontSize: 9, letterSpacing: '0.65em',
        color: '#c9a84c', textTransform: 'uppercase', marginBottom: 36,
      }}>RESERVE</div>

      {/* Spinner */}
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(201,168,76,0.15)', borderTopColor: '#c9a84c', animation: 'spin 1s linear infinite', marginBottom: 20 }} />

      {/* Step label */}
      <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)', letterSpacing: '0.1em', fontFamily: "'Tenor Sans', sans-serif" }}>
        {currentStep}…
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

/* ── Privy error / timeout screen ───────────────────────────────────── */
function PrivyErrorScreen() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#020305', padding: '0 24px',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
        boxShadow: '0 0 0 1px rgba(201,168,76,0.15), 0 0 20px rgba(201,168,76,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
      }}>
        <img
          src="/genesis-logo.png"
          width={64}
          height={64}
          alt="Genesis Reserve"
          style={{ width: '100%', height: '100%', display: 'block', borderRadius: '50%', opacity: 0.85 }}
          onError={(e) => {
            const el = e.currentTarget.parentElement!
            el.innerHTML = '<span style="font-size:44px;opacity:.7;color:#c9a84c">◈</span>'
          }}
        />
      </div>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 300, color: '#f5f0e8', letterSpacing: '0.22em', marginBottom: 4 }}>GENESIS</div>
      <div style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 9, letterSpacing: '0.6em', color: '#c9a84c', textTransform: 'uppercase', marginBottom: 32 }}>RESERVE</div>

      <div style={{
        maxWidth: 360, textAlign: 'center',
        padding: '20px 24px', borderRadius: 16,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,80,80,0.2)',
        marginBottom: 24,
      }}>
        <div style={{ fontSize: 13, color: 'rgba(245,240,232,0.7)', lineHeight: 1.7, fontFamily: "'Tenor Sans', sans-serif" }}>
          Wallet connection is taking longer than expected.
        </div>
        <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.35)', marginTop: 10, lineHeight: 1.6 }}>
          Check that <code style={{ color: '#c9a84c' }}>localhost:3200</code> is in your Privy dashboard allowed origins, then refresh.
        </div>
      </div>

      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '11px 28px', borderRadius: 24,
          background: '#c9a84c', color: '#1a1400',
          border: 'none', cursor: 'pointer',
          fontSize: 12, letterSpacing: '0.12em',
          fontFamily: "'Tenor Sans', sans-serif",
          marginBottom: 12,
        }}
      >
        Retry Connection
      </button>

      <button
        onClick={() => {
          // Strip Privy ID from URL to force preview mode on reload
          sessionStorage.setItem('gr_force_preview', '1')
          window.location.reload()
        }}
        style={{
          padding: '9px 24px', borderRadius: 24,
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.12)',
          color: 'rgba(245,240,232,0.45)',
          cursor: 'pointer', fontSize: 11,
          letterSpacing: '0.08em',
          fontFamily: "'Tenor Sans', sans-serif",
        }}
      >
        Continue in Preview Mode
      </button>
    </div>
  )
}
