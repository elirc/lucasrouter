'use client';

// Public entry point for the map. Leaflet touches `window` at import time, so
// the real implementation (MapViewInner) is loaded with `next/dynamic` and
// `ssr: false`; a pulsing skeleton fills the container meanwhile.

import dynamic from 'next/dynamic';
import type { ControlPosition } from 'leaflet';
import type { Depot, Driver, Route, Stop } from '@/lib/types';

/** Props for the RouteIQ map (contract shared with the dispatcher + driver pages). */
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
  fitPadding?: [number, number];
  /** Where the +/- zoom control sits. Default `'topright'` (bottom is covered by sheets on mobile). */
  zoomControlPosition?: ControlPosition;
  /** Where the OSM attribution sits. Default `'bottomright'`. */
  attributionPosition?: ControlPosition;
  /** Draw direction arrows along routes in dispatch mode. Default true. */
  showDirectionArrows?: boolean;
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
const MapView = dynamic<MapViewProps>(() => import('./MapViewInner'), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

export default MapView;
