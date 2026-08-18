// Map colour tokens. Leaflet-free on purpose: this file may be imported by
// modules that render on the server (e.g. RouteLegend), whereas `icons.ts`
// pulls in Leaflet and is client-only.

/** Marker colour for stops that are not on any route (slate-400). */
export const UNASSIGNED_COLOR = '#94a3b8';
/** Priority badge dot (amber-500). */
export const PRIORITY_COLOR = '#f59e0b';
/** Overnight badge dot (violet-600). */
export const OVERNIGHT_COLOR = '#7c3aed';
/** Delivered check (green-600). */
export const DELIVERED_COLOR = '#16a34a';
/** Failed X badge (red-600). */
export const FAILED_COLOR = '#dc2626';
/** Depot marker fill (slate-900). */
export const DEPOT_COLOR = '#0f172a';
/** Leg-start dot on the driver map (blue-600). */
export const HERE_COLOR = '#2563eb';
