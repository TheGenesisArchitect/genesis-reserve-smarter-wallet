import { GenesisProviders } from '../../providers'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <GenesisProviders>{children}</GenesisProviders>
}
