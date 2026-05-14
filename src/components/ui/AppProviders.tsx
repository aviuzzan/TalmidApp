'use client'
import { ReactNode } from 'react'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import { I18nProvider } from '@/lib/i18n'

/**
 * Providers globaux (i18n, toast, confirm) — wrapper client component
 * pour pouvoir être utilisé depuis le layout root (server component).
 */
export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          {children}
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  )
}
