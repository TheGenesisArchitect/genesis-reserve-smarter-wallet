import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
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
      <body suppressHydrationWarning>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
