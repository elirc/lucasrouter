'use client';

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  window.visualViewport?.addEventListener('resize', onChange);
  return () => {
    window.removeEventListener('resize', onChange);
    window.visualViewport?.removeEventListener('resize', onChange);
  };
}

function getSnapshot(): number {
  return window.innerHeight;
}

/** Server / hydration snapshot: unknown until mounted. */
function getServerSnapshot(): number {
  return 0;
}

/**
 * `window.innerHeight` (≈ 100dvh), resize-aware and SSR-safe (0 on the server
 * and during the hydration render). Used to turn the bottom sheet's 'half'
 * snap into "pixels of the map that are covered".
 */
export function useViewportHeight(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
