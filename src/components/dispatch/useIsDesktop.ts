'use client';

import { useSyncExternalStore } from 'react';

/** Tailwind `md` breakpoint — the dispatcher switches from sheet to side panel here. */
const DESKTOP_QUERY = '(min-width: 768px)';

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

/** Server / hydration snapshot: assume a phone until we can measure. */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * `true` when the viewport is at least Tailwind's `md` (768px). SSR-safe: it
 * is `false` on the server and during the hydration render, then flips to the
 * real value right after mount and tracks `matchMedia` changes (rotation,
 * window resize). Implemented with `useSyncExternalStore` so the switch to the
 * client value happens in the same pass as the store's hydration flag — no
 * one-frame flash of the mobile layout on desktop.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
