// Public surface of the map module.
//
// Everything exported here is safe to import from any page/component,
// including during server rendering: MapView is a `next/dynamic` (ssr:false)
// wrapper, RouteLegend is plain DOM, and the layer components are lazily-
// loaded handles (see ./layers.tsx). Leaflet itself is only ever evaluated in
// the browser. If you need the raw (non-lazy) layer components inside your own
// client-only Leaflet tree, import them from './StopMarker', './DepotMarker'
// or './RoutePolyline' directly.

export { default as MapView, MapSkeleton } from './MapView';
export type { MapViewProps, FitPadding, MapViewportInset } from './MapView';

export { StopMarker, DepotMarker, RoutePolyline, RoutePolylines } from './layers';
export type { StopMarkerProps } from './StopMarker';
export type { DepotMarkerProps } from './DepotMarker';
export type { RoutePolylineProps, RoutePolylinesProps, RouteVariant } from './RoutePolyline';

export { RouteLegend } from './RouteLegend';
export type { RouteLegendProps } from './RouteLegend';

export { UNASSIGNED_COLOR } from './colors';
