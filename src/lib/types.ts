// Domain model for RouteIQ. These types are the public contract shared by the
// UI, the store, the API routes and the (swappable) optimizer.

export type StopStatus = 'pending' | 'delivered' | 'failed';
export type Priority = 'standard' | 'priority' | 'overnight';

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
  distanceKm: number;
  driveMinutes: number;
  path?: [number, number][]; // optional polyline [lat,lng][]; if absent, draw straight line
}

export interface Route {
  driverId: string;
  stopIds: string[]; // ordered, excludes depot
  legs: RouteLeg[]; // depot -> s1 -> ... -> sN -> depot
  totalDistanceKm: number;
  totalMinutes: number; // drive + service
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
  totalDistanceKm: number;
  totalMinutes: number;
  stopsPerDriver: Record<string, number>;
  longestRouteMinutes: number;
  timeWindowViolations: number;
}

export type FailureReason = 'No one home' | 'Wrong address' | 'Damaged' | 'Other';
