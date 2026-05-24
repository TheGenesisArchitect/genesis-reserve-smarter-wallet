export const metadata = {
  title: 'Genesis Reserve v2.0 — The Treasury Intelligence Layer: Institutional Whitepaper',
  description: 'Institutional whitepaper v2.0 — 20-section document covering the Perpetual Capital Engine, fee architecture, yield source taxonomy, capital waterfall, $GRX revenue participation security, B2C growth model, risk framework, compliance, and 72-month base-case scenario roadmap.',
}

export default function WhitepaperPage() {
  return (
    <iframe
      src="/genesis-whitepaper-v2.html"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none' }}
      title="Genesis Reserve v2.0 — The Treasury Intelligence Layer"
    />
  )
}
