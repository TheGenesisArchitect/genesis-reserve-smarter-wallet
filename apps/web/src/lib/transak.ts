'use client'

import { Transak } from '@transak/transak-sdk'

const STAGING_URL = 'https://global-stg.transak.com'
const PRODUCTION_URL = 'https://global.transak.com'

export type TransakOrderData = {
  status?: string
  id?: string
  cryptoAmount?: number
  cryptoCurrency?: string
  network?: string
  walletAddress?: string
  fiatAmount?: number
  fiatCurrency?: string
}

function buildWidgetUrl(apiKey: string, walletAddress: string, fiatAmount: number): string {
  const base = process.env.NEXT_PUBLIC_TRANSAK_ENVIRONMENT === 'production' ? PRODUCTION_URL : STAGING_URL
  const params = new URLSearchParams({
    apiKey,
    walletAddress,
    network: 'arbitrum',
    cryptoCurrencyCode: 'USDC',
    fiatAmount: String(Math.round(fiatAmount * 100) / 100),
    fiatCurrency: 'USD',
    disableWalletAddressForm: 'true',
    hideMenu: 'true',
    themeColor: 'c9a84c',
  })
  return `${base}?${params.toString()}`
}

export function openTransakWidget(params: {
  walletAddress: string
  fiatAmount: number
  onSuccess?: (data: TransakOrderData) => void
  onClose?: () => void
}): () => void {
  if (typeof window === 'undefined') return () => {}

  const apiKey = process.env.NEXT_PUBLIC_TRANSAK_API ?? ''
  const widgetUrl = buildWidgetUrl(apiKey, params.walletAddress, params.fiatAmount)

  const transak = new Transak({
    widgetUrl,
    referrer: window.location.href,
    themeColor: 'c9a84c',
  })

  Transak.on('TRANSAK_ORDER_SUCCESSFUL', (data) => {
    params.onSuccess?.(data as TransakOrderData)
    transak.close()
  })

  Transak.on('TRANSAK_WIDGET_CLOSE', () => {
    params.onClose?.()
  })

  transak.init()
  return () => transak.close()
}
