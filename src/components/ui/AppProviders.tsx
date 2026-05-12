'use client'
import { ReactNode } from 'react'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'

/**
 * Providers globaux (toast, confirm) — wrapper client component
 * pour pouvoir être utilisé depuis le layout root (server component).
 */
export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        {children}
      </ConfirmProvider>
    </ToastProvider>
  )
}
