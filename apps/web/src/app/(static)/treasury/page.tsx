export const metadata = {
  title: 'Genesis Reserve — Perpetual Capital Engine',
  description: 'Live simulation of the Perpetual Capital Engine — 96-epoch daily settlement, policy-controlled yield routing, self-reinforcing institutional treasury infrastructure.',
}

export default function TreasuryPage() {
  return (
    <iframe
      src="/genesis-treasury-demo.html"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none' }}
      title="Genesis Reserve — Perpetual Capital Engine"
    />
  )
}
