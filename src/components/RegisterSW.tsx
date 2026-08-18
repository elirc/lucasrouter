'use client';

import { useEffect } from 'react';

/**
 * Registers the minimal service worker (`public/sw.js`) in production builds
 * only. In development the SW is skipped so HMR and fresh assets are never
 * shadowed by a stale worker. Renders nothing.
 */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err: unknown) => {
      console.warn('[RouteIQ] service worker registration failed', err);
    });
  }, []);

  return null;
}
