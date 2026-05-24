export const metadata = {
  title: 'Genesis Reserve — Investor Pitch 2026',
  description: 'The Sovereign Smart Wallet. Programmable Treasury. Real-World Spending. Yield on Every Dollar.',
}

export default function PitchPage() {
  return (
    <iframe
      src="/pitch-deck.html"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none' }}
      title="Genesis Reserve Investor Pitch Deck"
    />
  )
}
