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
      {/* No tile preconnect here: the landing and driver-picker pages never show
          a map, and an unused preconnect only takes bandwidth and a socket from
          the requests they do need. MapSkeleton opens the connection instead, so
          the hint ships exactly on the pages that render a map. */}
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
