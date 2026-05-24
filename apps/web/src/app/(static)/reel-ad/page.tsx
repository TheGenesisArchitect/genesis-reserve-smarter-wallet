export const metadata = {
  title: 'Genesis Reserve — Earn 15% APY on USDC | Digital Wallet',
  description: 'Genesis Reserve earns up to 15% APY on USDC. Compliant, insured, non-custodial. Powered by Aave, Pendle, US T-Bills, and Morpho on Arbitrum.',
}

export default function ReelAdPage() {
  return (
    <iframe
      src="/genesis-reel-ad.html"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none' }}
      title="Genesis Reserve — Earn 15% APY on USDC"
    />
  )
}
