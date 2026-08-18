import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

import { RegisterSW } from '@/components/RegisterSW';

import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'RouteIQ — Delivery Route Optimizer',
  description:
    'Smarter delivery routes for Madison, WI — optimize, dispatch, and follow every stop. Demo with mock data.',
  applicationName: 'RouteIQ',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'RouteIQ',
  },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f172a',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/* OSM tiles are the map's LCP image: open the connection early. */}
        <link rel="preconnect" href="https://tile.openstreetmap.org" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://tile.openstreetmap.org" />
      </head>
      <body className="min-h-dvh bg-slate-100 font-sans text-slate-900">
        {children}
        {/* No <Toast /> here: it reads the store, which would drag the optimizer + seed
            into every page's bundle (incl. the static landing). Each app screen
            (dispatch, driver) renders its own <Toast /> instead. */}
        <RegisterSW />
      </body>
    </html>
  );
}
