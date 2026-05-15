'use client'

import { useState, useEffect, type ReactNode } from 'react'

export type ViewKey =
  | 'home' | 'send' | 'deposit' | 'withdraw' | 'receive' | 'card' | 'vaults' | 'activity' | 'settings' | 'bridge' | 'swap'
  | 'agentic' | 'analytics' | 'yield-monitor' | 'compliance' | 'consultive' | 'scheduled' | 'batch' | 'admin'

interface AppShellProps {
  activeView: ViewKey
  onNavigate: (view: ViewKey) => void
  authenticated?: boolean
  address?: string
  onLogin?: () => void
  onLogout?: () => void
  children: ReactNode
}

const CONSUMER_NAV: Array<{ key: ViewKey; label: string; icon: (active: boolean) => ReactNode }> = [
  { key: 'home', label: 'Home', icon: (a) => <HomeIcon active={a} /> },
  { key: 'send', label: 'Send', icon: (a) => <SendIcon active={a} /> },
  { key: 'deposit', label: 'Add Money', icon: (a) => <PlusIcon active={a} /> },
  { key: 'withdraw', label: 'Withdraw', icon: (a) => <WithdrawIcon active={a} /> },
  { key: 'receive', label: 'Receive', icon: (a) => <ReceiveIcon active={a} /> },
  { key: 'bridge', label: 'Bridge', icon: (a) => <BridgeIcon active={a} /> },
  { key: 'swap', label: 'Swap', icon: (a) => <SwapNavIcon active={a} /> },
  { key: 'card', label: 'Card', icon: (a) => <CardIcon active={a} /> },
  { key: 'vaults', label: 'Vaults', icon: (a) => <VaultIcon active={a} /> },
  { key: 'activity', label: 'Activity', icon: (a) => <ActivityIcon active={a} /> },
  { key: 'yield-monitor', label: 'Yield Monitor', icon: (a) => <ActivityIcon active={a} /> },
  { key: 'settings', label: 'Settings', icon: (a) => <SettingsIcon active={a} /> },
]

export function AppShell({
  activeView, onNavigate, authenticated, address, onLogin, onLogout, children,
}: AppShellProps) {
  const [isMobile, setIsMobile] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarAddrCopied, setSidebarAddrCopied] = useState(false)

  function copySidebarAddress() {
    if (!address) return
    navigator.clipboard.writeText(address).then(() => {
      setSidebarAddrCopied(true)
      setTimeout(() => setSidebarAddrCopied(false), 2000)
    })
  }

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
      if (!e.matches) setMobileOpen(false)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  function navigate(view: ViewKey) {
    onNavigate(view)
    if (isMobile) setMobileOpen(false)
  }

  const sidebarVisible = !isMobile || mobileOpen

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: '#020305',
      color: '#f5f0e8',
      fontFamily: "'Tenor Sans', sans-serif",
    }}>

      {/* ── Mobile overlay ──────────────────────────────────────────── */}
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 39,
            background: 'rgba(0,0,0,0.62)',
          }}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside style={{
        width: 240,
        minHeight: '100vh',
        height: '100vh',
        position: isMobile ? 'fixed' : 'sticky',
        top: 0,
        left: 0,
        zIndex: 40,
        background: '#040608',
        borderRight: '1px solid rgba(201,168,76,0.12)',
        display: 'flex',
        flexDirection: 'column',
        padding: '28px 16px 22px',
        flexShrink: 0,
        overflow: 'hidden',
        transform: isMobile ? (mobileOpen ? 'translateX(0)' : 'translateX(-100%)') : 'none',
        transition: isMobile ? 'transform 0.28s cubic-bezier(0.4,0,0.2,1)' : 'none',
      }}>

        {/* Brand */}
        <div style={{ marginBottom: 26, paddingLeft: 4, display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Logo seal */}
          <div style={{
            width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
            boxShadow: '0 0 0 1px rgba(201,168,76,0.15), 0 0 18px rgba(201,168,76,0.22), 0 0 40px rgba(201,168,76,0.09)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img
              src="/genesis-logo.png"
              alt="Genesis Reserve"
              width={40}
              height={40}
              style={{ width: '100%', height: '100%', display: 'block', borderRadius: '50%' }}
              onError={(e) => {
                const el = e.currentTarget.parentElement!
                el.innerHTML = "<span style=\"font-size:28px;opacity:.88;color:#c9a84c\">◈</span>"
              }}
            />
          </div>
          <div>
            <div style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 22,
              fontWeight: 300,
              color: '#f5f0e8',
              letterSpacing: '0.28em',
              lineHeight: 1,
            }}>GENESIS</div>
            <div style={{
              fontFamily: "'Tenor Sans', sans-serif",
              fontSize: 7.5,
              letterSpacing: '0.6em',
              color: '#c9a84c',
              marginTop: 4,
              textTransform: 'uppercase',
            }}>RESERVE</div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: '100%', height: 1, background: 'rgba(201,168,76,0.18)', marginBottom: 22 }} />

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          {CONSUMER_NAV.map((item) => {
            const active = activeView === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => navigate(item.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: active ? '1px solid rgba(201,168,76,0.28)' : '1px solid transparent',
                  background: active ? 'rgba(201,168,76,0.08)' : 'transparent',
                  color: active ? '#c9a84c' : 'rgba(245,240,232,0.5)',
                  fontFamily: "'Tenor Sans', sans-serif",
                  fontSize: 13,
                  letterSpacing: '0.04em',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'color 0.18s, background 0.18s, border-color 0.18s',
                }}
              >
                {item.icon(active)}
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Bottom — tier + user */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 16 }}>
          {/* Tier badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            marginBottom: 14,
            padding: '8px 10px',
            borderRadius: 9,
            background: 'rgba(201,168,76,0.07)',
            border: '1px solid rgba(201,168,76,0.18)',
            cursor: 'pointer',
          }}
            onClick={() => navigate('settings')}
          >
            <ShieldIcon />
            <div>
              <div style={{ fontSize: 9, color: 'rgba(245,240,232,0.38)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 1 }}>DAO Tier</div>
              <div style={{ fontSize: 12, color: '#c9a84c', letterSpacing: '0.04em' }}>Guardian</div>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 12, color: 'rgba(201,168,76,0.35)' }}>›</div>
          </div>

          {/* User row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: authenticated ? 'rgba(201,168,76,0.18)' : 'rgba(255,255,255,0.05)',
              border: authenticated ? '1px solid rgba(201,168,76,0.35)' : '1px solid rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 600, color: authenticated ? '#c9a84c' : 'rgba(245,240,232,0.3)', flexShrink: 0,
              fontFamily: "'Tenor Sans', sans-serif",
            }}>
              {authenticated ? (address ? address.slice(2, 4).toUpperCase() : '✓') : '?'}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, color: authenticated ? '#f5f0e8' : 'rgba(245,240,232,0.35)', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
                {authenticated ? 'Connected' : 'Not connected'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 10, color: 'rgba(245,240,232,0.32)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: address ? 'monospace' : undefined }}>
                  {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Click Connect to login'}
                </span>
                {address && (
                  <button
                    type="button"
                    onClick={copySidebarAddress}
                    title={sidebarAddrCopied ? 'Copied!' : address}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0, lineHeight: 1 }}
                  >
                    {sidebarAddrCopied ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(201,168,76,0.5)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>
            {authenticated ? (
              <button type="button" onClick={onLogout} title="Sign out"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(245,240,232,0.7)',
                  cursor: 'pointer',
                  fontSize: 10,
                  flexShrink: 0,
                  padding: '4px 8px',
                  borderRadius: 6,
                  fontFamily: "'Tenor Sans', sans-serif",
                  letterSpacing: '0.06em',
                }}>
                Sign out
              </button>
            ) : (
              <button type="button" onClick={onLogin}
                style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c', cursor: 'pointer', fontSize: 10, borderRadius: 6, padding: '4px 8px', flexShrink: 0, fontFamily: "'Tenor Sans', sans-serif", letterSpacing: '0.06em' }}>
                Connect
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main style={{
        flex: 1,
        minWidth: 0,
        overflowY: 'auto',
        marginLeft: isMobile ? 0 : undefined,
      }}>
        {/* Mobile top bar */}
        {isMobile && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 30,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px',
            background: '#040608',
            borderBottom: '1px solid rgba(201,168,76,0.12)',
          }}>
            <button
              type="button"
              onClick={() => setMobileOpen(o => !o)}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: '7px 9px',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}
            >
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 18, height: 1.5, background: '#c9a84c', borderRadius: 2 }} />
              ))}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                boxShadow: '0 0 0 1px rgba(201,168,76,0.15), 0 0 12px rgba(201,168,76,0.22)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <img
                  src="/genesis-logo.png"
                  alt=""
                  width={28}
                  height={28}
                  style={{ width: '100%', height: '100%', display: 'block', borderRadius: '50%' }}
                  onError={(e) => {
                    const el = e.currentTarget.parentElement!
                    el.innerHTML = "<span style=\"font-size:18px;color:#c9a84c\">◈</span>"
                  }}
                />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 300, color: '#f5f0e8', letterSpacing: '0.22em', lineHeight: 1 }}>GENESIS</div>
                <div style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 7, letterSpacing: '0.5em', color: '#c9a84c', textTransform: 'uppercase' }}>RESERVE</div>
              </div>
            </div>
            {authenticated ? (
              <button
                type="button"
                onClick={onLogout}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(245,240,232,0.75)',
                  cursor: 'pointer',
                  fontSize: 10,
                  borderRadius: 6,
                  padding: '5px 8px',
                  fontFamily: "'Tenor Sans', sans-serif",
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                Sign out
              </button>
            ) : (
              <div style={{ width: 36 }} />
            )}
          </div>
        )}

        {children}
      </main>
    </div>
  )
}

/* ── SVG Icons ──────────────────────────────────────────────────────────── */

function HomeIcon({ active }: { active: boolean }) {
  const c = active ? '#c9a84c' : 'rgba(245,240,232,0.45)'
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function SendIcon({ active }: { active: boolean }) {
  const c = active ? '#c9a84c' : 'rgba(245,240,232,0.45)'
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function PlusIcon({ active }: { active: boolean }) {
  const c = active ? '#c9a84c' : 'rgba(245,240,232,0.45)'
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  )
}

function WithdrawIcon({ active }: { active: boolean }) {
  const c = active ? '#c9a84c' : 'rgba(245,240,232,0.45)'
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <polyline points="8 12 12 16 16 12" />
    </svg>
  )
}

function ReceiveIcon({ active }: { active: boolean }) {
  const c = active ? '#c9a84c' : 'rgba(245,240,232,0.45)'
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8 17 12 21 16 17" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" />
    </svg>
  )
}

function CardIcon({ active }: { active: boolean }) {
  const c = active ? '#c9a84c' : 'rgba(245,240,232,0.45)'
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  )
}

function VaultIcon({ active }: { active: boolean }) {
  const c = active ? '#c9a84c' : 'rgba(245,240,232,0.45)'
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="9" x2="12" y2="3" />
    </svg>
  )
}

function ActivityIcon({ active }: { active: boolean }) {
  const c = active ? '#c9a84c' : 'rgba(245,240,232,0.45)'
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function SettingsIcon({ active }: { active: boolean }) {
  const c = active ? '#c9a84c' : 'rgba(245,240,232,0.45)'
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function SwapNavIcon({ active }: { active: boolean }) {
  const c = active ? '#c9a84c' : 'rgba(245,240,232,0.45)'
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 16V4m0 0L3 8m4-4l4 4" />
      <path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  )
}

function BridgeIcon({ active }: { active: boolean }) {
  const c = active ? '#c9a84c' : 'rgba(245,240,232,0.45)'
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h16M4 12c0-4 3-7 8-7s8 3 8 7" />
      <path d="M8 12v4M12 12v4M16 12v4" />
      <path d="M3 16h18" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  )
}
