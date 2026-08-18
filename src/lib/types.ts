// Domain model for RouteIQ. These types are the public contract shared by the
// UI, the store, the API routes and the (swappable) optimizer.

export type StopStatus = 'pending' | 'delivered' | 'failed';
export type Priority = 'standard' | 'priority' | 'overnight';

/** How a parcel was handed over. Mirrors the driver app's delivery sheet. */
export type DeliveryMethod = 'handed' | 'door' | 'neighbour' | 'desk';

/**
 * Proof of delivery captured by the driver when a stop is completed.
 * Everything except `at` is optional: the fast path (tap Delivered, confirm the
 * default method) records only `{ method: 'handed', at }`.
 *
 * `photo` is a *downscaled* JPEG data URL (longest side ≤ 320 px, ~40 KB) —
 * never the original camera frame: the whole store lives in localStorage.
 */
export interface DeliveryProof {
  method?: DeliveryMethod;
  recipientName?: string;
  note?: string;
  photo?: string; // small JPEG data URL, ≤ ~40 KB
  at: string; // ISO
}

/**
 * One entry of the append-only driver activity log (`deliveryLog` in the
 * store). Denormalised on purpose: the log must still read correctly after the
 * dispatcher re-optimizes or a stop is undone, so it copies the outcome rather
 * than pointing at the stop's current status. `hasPhoto` (not the photo
 * itself) keeps the log small — the image lives once, on `Stop.proof`.
 */
export interface DeliveryEvent {
  id: string;
  at: string; // ISO
  driverId: string;
  stopId: string;
  type: 'delivered' | 'failed' | 'undo' | 'deferred';
  method?: DeliveryMethod;
  reason?: string;
  recipientName?: string;
  note?: string;
  hasPhoto?: boolean;
}

export interface Stop {
  id: string; // e.g. "S001"
  address: string; // human-readable Madison address
  lat: number;
  lng: number;
  recipient: string; // fake name
  packages: number; // 1–5
  priority: Priority;
  timeWindow?: { start: string; end: string }; // "HH:MM" 24h, optional
  serviceMinutes: number; // time spent at the stop, 2–8
  status: StopStatus;
  notes?: string;
  deliveredAt?: string; // ISO timestamp
  /** Set when the stop is delivered (failed attempts may carry only a note). */
  proof?: DeliveryProof;
}

export interface Driver {
  id: string; // "D1"
  name: string;
  vehicle: string; // "Van 12"
  color: string; // hex, used for map/route color
  shiftStart: string; // "08:00"
  capacityPackages: number;
}

export interface Depot {
  id: 'DEPOT';
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface RouteLeg {
  fromId: string; // Stop id or 'DEPOT'
  toId: string;
  distanceKm: number; // estimated road km (placeholder: haversine x 1.3)
  driveMinutes: number;
  path?: [number, number][]; // optional polyline [lat,lng][]; if absent, draw straight line
}

export interface Route {
  driverId: string;
  stopIds: string[]; // ordered, excludes depot
  legs: RouteLeg[]; // depot -> s1 -> ... -> sN -> depot
  totalDistanceKm: number; // estimated road km
  totalMinutes: number; // drive + service + waiting (early arrival waits for the window to open)
  etaByStopId: Record<string, string>; // "HH:MM"
}

export interface OptimizeOptions {
  respectTimeWindows?: boolean; // default true
  balanceLoad?: boolean; // default true
  avgSpeedKmh?: number; // default 32 (urban)
}

export interface OptimizeRequest {
  depot: Depot;
  drivers: Driver[];
  stops: Stop[];
  options?: OptimizeOptions;
}

export interface OptimizeResponse {
  routes: Route[];
  unassignedStopIds: string[];
  metrics: RouteMetrics;
  algorithm: string; // e.g. "nn-2opt-v1"
  computeMs: number;
}

export interface RouteMetrics {
  totalDistanceKm: number; // sum of Route.totalDistanceKm (estimated road km)
  totalMinutes: number; // sum of Route.totalMinutes (drive + service + waiting)
  stopsPerDriver: Record<string, number>;
  longestRouteMinutes: number;
  timeWindowViolations: number; // stops whose ETA is strictly after timeWindow.end
}

export type FailureReason = 'No one home' | 'Wrong address' | 'Damaged' | 'Other';
