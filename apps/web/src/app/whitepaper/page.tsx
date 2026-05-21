export const metadata = {
  title: 'Genesis Reserve — Perpetual Capital Engine: Treasury Infrastructure Whitepaper',
  description: 'Risk-managed treasury infrastructure whitepaper covering the Perpetual Capital Engine mechanics, $GRX revenue participation security, ERC-4626 vault architecture, yield source taxonomy, and 72-month base-case scenario roadmap.',
}

export default function WhitepaperPage() {
  return (
    <iframe
      src="/genesis-whitepaper.html"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none' }}
      title="Genesis Reserve Perpetual Capital Engine — Whitepaper"
    />
  )
}
