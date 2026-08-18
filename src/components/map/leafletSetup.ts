// One-time, client-only Leaflet configuration.
//
// Leaflet's default marker icon resolves its PNGs relative to the stylesheet
// URL, which breaks under bundlers and produces 404s (marker-icon.png,
// marker-shadow.png). RouteIQ never uses the default icon — every marker is an
// `L.divIcon` — but we still neutralise the default so nothing can accidentally
// request those files (e.g. a `<Marker>` rendered without an `icon`).

import { Icon } from 'leaflet';

/** 1×1 transparent GIF: a valid, request-free image source. */
const BLANK_GIF =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

let configured = false;

/**
 * Configure Leaflet globals exactly once. Safe to call from any client module;
 * a no-op on the server (Leaflet itself must never be imported there).
 */
export function setupLeaflet(): void {
  if (configured || typeof window === 'undefined') return;
  configured = true;

  // Leaflet's typings do not expose the private `_getIconUrl`; remove it
  // defensively so `Icon.Default` falls back to the explicit URLs below.
  const proto = Icon.Default.prototype as unknown as { _getIconUrl?: unknown };
  if ('_getIconUrl' in proto) {
    delete proto._getIconUrl;
  }

  Icon.Default.mergeOptions({
    iconUrl: BLANK_GIF,
    iconRetinaUrl: BLANK_GIF,
    shadowUrl: BLANK_GIF,
  });
}
