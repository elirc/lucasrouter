'use client';

// Public entry point for the map. Leaflet touches `window` at import time, so
// the real implementation (MapViewInner) is loaded with `next/dynamic` and
// `ssr: false`; a pulsing skeleton fills the container meanwhile.

import dynamic from 'next/dynamic';
import type { ControlPosition } from 'leaflet';
import type { Depot, Driver, Route, Stop } from '@/lib/types';

/** Props for the RouteIQ map (contract shared with the dispatcher + driver pages). */
/**
 * Padding for the fit-to-all-stops framing. Either symmetric `[x, y]` or
 * asymmetric `{ topLeft, bottomRight }` — the latter lets a page keep the
 * markers above a fixed bottom sheet (`bottomRight: [x, sheetHeight + x]`).
 */
export type FitPadding =
  | [number, number]
  | { topLeft: [number, number]; bottomRight: [number, number] };

/**
 * Pixels of the map container hidden under page overlays (a bottom sheet, a
 * floating bar). Marker popups pan into the uncovered part instead of opening
 * under the overlay. Both edges default to 0.
 */
export interface MapViewportInset {
  bottom?: number;
  top?: number;
}

export interface MapViewProps {
  depot: Depot;
  stops: Stop[];
  drivers: Driver[];
  routes: Route[] | null;
  /** Routes/stops of these drivers are not drawn (legend toggles). */
  hiddenDriverIds?: string[];
  /** Opens/highlights this stop's popup; pans to it when off-screen. */
  selectedStopId?: string | null;
  onSelectStop?: (stopId: string | null) => void;
  /** When provided the stop popup shows a "Reassign to…" driver select. */
  onReassign?: (stopId: string, toDriverId: string) => void;
  /**
   * DRIVER MODE: fit bounds to this leg, draw it bold, draw the rest of that
   * driver's route faint, hide other drivers. `fromId` / `toId` are stop ids
   * or `'DEPOT'`.
   */
  focus?: { driverId: string; fromId: string; toId: string } | null;
  /** When this value changes the map re-fits to all visible stops + depot (dispatch mode). */
  fitKey?: string | number;
  /** Numbered 1..N markers along each route (default true when routes exist). */
  showSequenceNumbers?: boolean;
  /** Applied to the outer container (the parent must give it a height). */
  className?: string;

  // --- Optional extras (not part of the cross-module contract) -------------
  /** Padding used by fit-to-bounds in dispatch mode. Default `[32, 32]`. */
  fitPadding?: FitPadding;
  /** Where the +/- zoom control sits. Default `'topright'` (bottom is covered by sheets on mobile). */
  zoomControlPosition?: ControlPosition;
  /** Where the OSM attribution sits. Default `'bottomright'`. */
  attributionPosition?: ControlPosition;
  /** Draw direction arrows along routes in dispatch mode. Default true. */
  showDirectionArrows?: boolean;
  /**
   * Overlay-covered strips of the map (px). The selected stop's popup is
   * panned into the uncovered area (dispatch: the mobile bottom sheet).
   */
  viewportInset?: MapViewportInset;
}

function MapSkeleton() {
  return (
    <div
      className="h-full w-full animate-pulse bg-slate-200"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading map"
    />
  );
}

/**
 * Client-only Leaflet map. Renders `MapSkeleton` until the Leaflet bundle has
 * loaded in the browser.
 */
// Kick off the Leaflet chunk download as soon as a page that uses the map
// evaluates (i.e. in parallel with hydration and the /api/seed fetch) instead
// of waiting until the first <MapView /> render. `dynamic()` below resolves the
// same module from cache. Client-only guard: this module is also evaluated on
// the server for the SSR pass of pages that import it.
if (typeof window !== 'undefined') {
  void import('./MapViewInner');
}

const MapView = dynamic<MapViewProps>(() => import('./MapViewInner'), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

export default MapView;
