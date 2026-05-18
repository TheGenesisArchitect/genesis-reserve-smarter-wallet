// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/src/app/layout.tsx
//
// Root Next.js 14 App Router layout.
// CRITICAL: GenesisProviders must wrap the entire app here.
// Without this file the app does not render — all hooks throw immediately.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { GenesisProviders } from '../providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Genesis Reserve — Sovereign Yield Terminal',
  description:
    'Programmable treasury infrastructure. 4–11% APY. Global remittance. Compliance-by-design.',
  openGraph: {
    title: 'Genesis Reserve',
    description: 'The Operating System for Stablecoins',
    siteName: 'Genesis Reserve',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/*
        suppressHydrationWarning on body: Privy injects attributes during
        client-side hydration. Without this, Next.js throws a hydration
        mismatch warning in development.
      */}
      <body suppressHydrationWarning>
        <GenesisProviders>
          {children}
        </GenesisProviders>
        <Analytics />
      </body>
    </html>
  )
}
