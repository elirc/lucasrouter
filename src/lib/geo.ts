// Geographic helpers that are not part of the optimizer (bounds, formatting).

export type LatLng = { lat: number; lng: number };
export type LatLngTuple = [number, number];

/** Center of Madison, WI — used as the map default before data loads. */
export const MADISON_CENTER: LatLngTuple = [43.0731, -89.4012];

/** Compute a [[south, west], [north, east]] bounds box around points. */
export function boundsOf(points: LatLng[]): [LatLngTuple, LatLngTuple] | null {
  if (points.length === 0) return null;
  let s = Infinity;
  let w = Infinity;
  let n = -Infinity;
  let e = -Infinity;
  for (const p of points) {
    if (p.lat < s) s = p.lat;
    if (p.lat > n) n = p.lat;
    if (p.lng < w) w = p.lng;
    if (p.lng > e) e = p.lng;
  }
  return [
    [s, w],
    [n, e],
  ];
}

/** "4.2 km" style formatting. */
export function formatKm(km: number, digits = 1): string {
  return `${km.toFixed(digits)} km`;
}

/** Percent delta from a -> b, e.g. 100 -> 62 = -38. Returns null when a is 0. */
export function pctDelta(a: number, b: number): number | null {
  if (!a) return null;
  return ((b - a) / a) * 100;
}

/** Google Maps directions deep link (no API key needed). */
export function googleMapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/** Shorten "123 Main St, Madison, WI 53703" -> "123 Main St". */
export function shortAddress(address: string): string {
  const idx = address.indexOf(',');
  return idx === -1 ? address : address.slice(0, idx);
}
