'use client';

// SSR-safe handles for the Leaflet-bound layer components.
//
// `StopMarker.tsx`, `DepotMarker.tsx` and `RoutePolyline.tsx` import
// react-leaflet (and therefore Leaflet) at module top level, and Leaflet throws
// `window is not defined` the moment it is evaluated on the server. Anything
// re-exported from the package barrel (`./index.ts`) can be pulled into a
// page's server render just by importing `MapView`, so the barrel exposes
// these lazily-loaded wrappers instead of the raw modules. Inside the map
// (MapViewInner is itself client-only) we import the raw components directly.
//
// The wrappers behave like the originals: render them anywhere under
// <MapContainer> (React context flows through `next/dynamic`).

import dynamic from 'next/dynamic';
import type { StopMarkerProps } from './StopMarker';
import type { DepotMarkerProps } from './DepotMarker';
import type { RoutePolylineProps, RoutePolylinesProps } from './RoutePolyline';

export const StopMarker = dynamic<StopMarkerProps>(
  () => import('./StopMarker').then((m) => m.StopMarker),
  { ssr: false },
);

export const DepotMarker = dynamic<DepotMarkerProps>(
  () => import('./DepotMarker').then((m) => m.DepotMarker),
  { ssr: false },
);

export const RoutePolyline = dynamic<RoutePolylineProps>(
  () => import('./RoutePolyline').then((m) => m.RoutePolyline),
  { ssr: false },
);

export const RoutePolylines = dynamic<RoutePolylinesProps>(
  () => import('./RoutePolyline').then((m) => m.RoutePolylines),
  { ssr: false },
);
