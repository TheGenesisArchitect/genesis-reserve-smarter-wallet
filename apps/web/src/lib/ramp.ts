'use client'

const STAGING_URL    = 'https://ri-widget-staging.firebaseapp.com/'
const PRODUCTION_URL = 'https://app.ramp.network/'

export type RampPurchase = {
  id?: string
  status?: string
  cryptoAmount?: string
  asset?: { symbol: string; chain: string }
  fiatValue?: number
  fiatCurrency?: string
  finalTxHash?: string
  paymentMethodType?: string
}

function buildWidgetUrl(apiKey: string, walletAddress: string, fiatAmount: number): string {
  const base = process.env.NEXT_PUBLIC_RAMP_ENVIRONMENT === 'production' ? PRODUCTION_URL : STAGING_URL
  const params = new URLSearchParams({
    apiKey,
    userAddress:  walletAddress,
    swapAsset:    'ARBITRUM_USDC',
    fiatCurrency: 'USD',
    fiatValue:    String(Math.round(fiatAmount * 100) / 100),
    hostAppName:  'Genesis Reserve',
    hostLogoUrl:  'https://genesis-privy.vercel.app/genesis-logo.png',
    enabledFlows: 'ONRAMP',
    defaultFlow:  'ONRAMP',
  })
  return `${base}?${params.toString()}`
}

export function openRampWidget(params: {
  walletAddress: string
  fiatAmount: number
  onPurchaseCreated?: (purchase: RampPurchase) => void
  onSuccess?: (purchase: RampPurchase) => void
  onClose?: () => void
}): () => void {
  if (typeof window === 'undefined') return () => {}

  const apiKey    = process.env.NEXT_PUBLIC_RAMP_API_KEY ?? ''
  const widgetUrl = buildWidgetUrl(apiKey, params.walletAddress, params.fiatAmount)
  const widgetOrigin = new URL(widgetUrl).origin

  // ── Overlay ───────────────────────────────────────────────────────────────
  const overlay = document.createElement('div')
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '9999',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
  })

  // ── Container ─────────────────────────────────────────────────────────────
  const container = document.createElement('div')
  Object.assign(container.style, {
    position: 'relative', width: 'min(480px, 96vw)', height: 'min(700px, 90vh)',
    borderRadius: '20px', overflow: 'hidden',
    backgroundColor: '#111', boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
  })

  // ── Close button ──────────────────────────────────────────────────────────
  const closeBtn = document.createElement('button')
  closeBtn.setAttribute('aria-label', 'Close')
  closeBtn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
  Object.assign(closeBtn.style, {
    position: 'absolute', top: '12px', right: '12px', zIndex: '10',
    width: '32px', height: '32px', borderRadius: '50%',
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff',
    backdropFilter: 'blur(4px)',
  })

  // ── Loading spinner ───────────────────────────────────────────────────────
  const loader = document.createElement('div')
  Object.assign(loader.style, {
    position: 'absolute', inset: '0',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#111',
  })
  loader.innerHTML = `
    <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="16" fill="none" stroke="#c9a84c" stroke-width="3" stroke-dasharray="80" stroke-dashoffset="60" stroke-linecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 20 20" to="360 20 20" dur="0.9s" repeatCount="indefinite"/>
      </circle>
    </svg>`

  // ── Iframe ────────────────────────────────────────────────────────────────
  const iframe = document.createElement('iframe')
  iframe.src = widgetUrl
  iframe.setAttribute('allow', 'payment; camera; microphone; clipboard-write')
  iframe.setAttribute('allowfullscreen', '')
  Object.assign(iframe.style, { width: '100%', height: '100%', border: 'none', display: 'block' })
  iframe.onload = () => { loader.style.display = 'none' }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  let cleaned = false
  function cleanup() {
    if (cleaned) return
    cleaned = true
    window.removeEventListener('message', onMessage)
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
    params.onClose?.()
  }

  // ── postMessage listener ──────────────────────────────────────────────────
  function onMessage(event: MessageEvent) {
    if (event.origin !== widgetOrigin) return
    const type: string = event.data?.type ?? ''
    if (type === 'PURCHASE_CREATED') {
      params.onPurchaseCreated?.(event.data?.payload?.purchase as RampPurchase)
    } else if (type === 'PURCHASE_SUCCESSFUL') {
      params.onSuccess?.(event.data?.payload?.purchase as RampPurchase)
      cleanup()
    } else if (type === 'WIDGET_CLOSE') {
      cleanup()
    }
  }

  window.addEventListener('message', onMessage)
  closeBtn.addEventListener('click', cleanup)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup() })

  // ── Mount ─────────────────────────────────────────────────────────────────
  container.appendChild(loader)
  container.appendChild(iframe)
  container.appendChild(closeBtn)
  overlay.appendChild(container)
  document.body.appendChild(overlay)

  return cleanup
}
