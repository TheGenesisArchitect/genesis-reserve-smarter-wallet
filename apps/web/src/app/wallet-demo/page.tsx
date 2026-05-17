export const metadata = {
  title: 'Genesis Reserve — Smarter Wallet Interactive Demo',
  description: 'Experience the complete Genesis Smarter Wallet lifecycle: login, wallet creation, funding, vault selection, live yield, send, and withdraw — all on real deployed infrastructure.',
}

export default function WalletDemoPage() {
  return (
    <iframe
      src="/wallet-demo.html"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none' }}
      title="Genesis Reserve — Smarter Wallet Interactive Demo"
    />
  )
}
