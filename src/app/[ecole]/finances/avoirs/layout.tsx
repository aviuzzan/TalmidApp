import EcoleAppLayout from '@/components/ui/EcoleAppLayout'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <EcoleAppLayout><div style={{ padding: '24px 32px' }}>{children}</div></EcoleAppLayout>
}
