'use client';

// Viewport helpers that live inside <MapContainer> (they need `useMap()`):
//  - FitBounds: fit to all visible points on mount / when `fitKey` changes,
//    and keep the map sized correctly when its container resizes.
//  - FocusFit: driver mode — frame the active leg (or centre on a single point).

import { useEffect, useEffectEvent, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { latLngBounds, type Map as LeafletMap } from 'leaflet';
import { boundsOf, type LatLng, type LatLngTuple } from '@/lib/geo';
import type { FitPadding } from './MapView';

const FIT_MAX_ZOOM = 15;
const DEFAULT_PADDING: [number, number] = [32, 32];

export interface FitBoundsProps {
  /** Points that should be on screen (visible stops + depot). */
  points: LatLng[];
  /** Whenever this changes the map re-fits (dispatch mode). */
  fitKey?: string | number;
  /** Fit padding in pixels (symmetric tuple or { topLeft, bottomRight }). Default [32, 32]. */
  padding?: FitPadding;
  /** Suppress fitting (e.g. when a focus leg is active). */
  disabled?: boolean;
}

/**
 * Fits the map to `points` on mount and whenever `fitKey` changes (unless
 * `disabled`). Also fits once when points first become available (initial data
 * load) so an empty-then-populated map is framed without needing a fitKey
 * change. Observes the map container for size changes and calls
 * `invalidateSize()` so the map renders correctly inside flex layouts and
 * behind resizing panels / bottom sheets.
 */
export function FitBounds({ points, fitKey, padding, disabled = false }: FitBoundsProps) {
  const map = useMap();
  // Initialised from the first render so the mount fit above is not repeated.
  const hadPointsRef = useRef(points.length > 0);

  // Effect Event: reads the *latest* points/padding without being a dependency.
  const fitNow = useEffectEvent(() => {
    fitTo(map, points, padding);
  });

  // Fit on mount, on fitKey change, and when focus mode is switched off.
  useEffect(() => {
    if (disabled) return;
    fitNow();
  }, [map, fitKey, disabled]);

  // Fit once when points go from none → some (seed loaded after mount).
  useEffect(() => {
    const has = points.length > 0;
    if (has && !hadPointsRef.current && !disabled) {
      fitTo(map, points, padding);
    }
    hadPointsRef.current = has;
  }, [map, points, padding, disabled]);

  // Keep Leaflet's notion of the container size in sync with layout changes.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const el = map.getContainer();
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [map]);

  return null;
}

function fitTo(map: LeafletMap, points: LatLng[], padding?: FitPadding) {
  const b = boundsOf(points);
  if (!b) return;
  const bounds = latLngBounds(b[0], b[1]);
  if (!bounds.isValid()) return;
  const pad = padding ?? DEFAULT_PADDING;
  const paddingOpts = Array.isArray(pad)
    ? { padding: pad }
    : { paddingTopLeft: pad.topLeft, paddingBottomRight: pad.bottomRight };
  map.fitBounds(bounds, { ...paddingOpts, maxZoom: FIT_MAX_ZOOM, animate: false });
}

// ---------------------------------------------------------------------------

export interface FocusFitProps {
  /** Start of the active leg (or null if unknown). */
  from: LatLngTuple | null;
  /** End of the active leg (or null if unknown). */
  to: LatLngTuple | null;
  /** Any string that changes when the focus target changes (driver/from/to). */
  focusKey: string;
}

/**
 * Driver mode framing: fit both leg endpoints with padding [48, 48] and
 * maxZoom 15; when both points coincide (or only one is known) centre on it at
 * zoom 15. The first fit is instant, later refits animate.
 */
export function FocusFit({ from, to, focusKey }: FocusFitProps) {
  const map = useMap();
  const firstRef = useRef(true);

  const frame = useEffectEvent(() => {
    const animate = !firstRef.current;
    firstRef.current = false;
    if (!from && !to) return;
    if (!from || !to || (from[0] === to[0] && from[1] === to[1])) {
      const p = (from ?? to) as LatLngTuple;
      map.setView(p, FIT_MAX_ZOOM, { animate });
      return;
    }
    map.fitBounds(latLngBounds(from, to), { padding: [48, 48], maxZoom: FIT_MAX_ZOOM, animate });
  });

  // Re-frame whenever the focus target changes (focusKey encodes driver/from/to).
  useEffect(() => {
    frame();
  }, [map, focusKey]);

  return null;
}
