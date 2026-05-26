export interface NewsDrop {
  id: string
  slot: 'morning' | 'midday' | 'evening'
  slotLabel: string
  slotTime: string
  publishedAt: string
  headline: string
  summary: string
  source: string
  sourceUrl: string
  category: 'DeFi' | 'Stablecoin' | 'Regulation' | 'Infrastructure' | 'Macro' | 'Payments'
  genesisAngle: string
  social: {
    twitter: string
    instagram: string
    linkedin: string
    tiktok: string
  }
}

export interface NewsDropsResponse {
  drops: NewsDrop[]
  generatedAt: string
}
