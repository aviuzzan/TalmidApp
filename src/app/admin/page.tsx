'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminRootPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/dashboard') }, [router])
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#060B18' }}>
      <div style={{ color: 'rgba(255,255,255,0.3)' }}>Redirection...</div>
    </div>
  )
}
