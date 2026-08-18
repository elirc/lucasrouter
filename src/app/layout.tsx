import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

import { RegisterSW } from '@/components/RegisterSW';
import { Toast } from '@/components/ui/Toast';

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
      <body className="min-h-dvh bg-slate-100 font-sans text-slate-900">
        {children}
        <Toast />
        <RegisterSW />
      </body>
    </html>
  );
}
