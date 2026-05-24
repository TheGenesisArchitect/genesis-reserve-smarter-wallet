export const metadata = {
  title: 'Genesis Reserve — Smarter Wallet Demo',
  description: 'Experience the Genesis Reserve Smarter Wallet — non-custodial, yield-bearing, card-enabled digital dollar wallet powered by the Perpetual Capital Engine.',
}

export default function DemoPage() {
  return (
    <iframe
      src="/genesis-wallet-demo.html"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none' }}
      title="Genesis Reserve — Smarter Wallet Demo"
    />
  )
}
