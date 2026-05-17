export const metadata = {
  title: 'Genesis Reserve — Perpetual Capital Engine: A New Asset Class Whitepaper',
  description: 'Technical whitepaper covering engine mechanics, $GRX tokenomics, smart contract architecture, B2C adoption strategy, and the 72-month sovereign treasury roadmap.',
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
