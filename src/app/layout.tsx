import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TalmidApp — Système de gestion scolaire',
  description: 'TalmidApp : la plateforme moderne de gestion pour écoles juives. Administration, facturation, pédagogie, portail famille — tout en un.',
  applicationName: 'TalmidApp',
  keywords: ['gestion scolaire', 'école', 'inscriptions', 'facturation', 'portail famille', 'TalmidApp'],
  authors: [{ name: 'TalmidApp' }],
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180' },
    ],
    shortcut: '/favicon.ico',
  },
  appleWebApp: {
    capable: true,
    title: 'TalmidApp',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    title: 'TalmidApp — Système de gestion scolaire',
    description: 'La plateforme moderne pour gérer une école : administration, facturation, pédagogie, portail famille.',
    url: 'https://talmidapp.fr',
    siteName: 'TalmidApp',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    locale: 'fr_FR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TalmidApp — Système de gestion scolaire',
    description: 'La plateforme moderne pour gérer une école.',
    images: ['/og-image.png'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#1A3A6B',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
