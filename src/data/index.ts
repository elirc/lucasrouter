import type { Depot, Driver, Stop } from '@/lib/types';
import depotJson from './depot.json';
import driversJson from './drivers.json';
import stopsJson from './stops.json';

/** Single east-side depot. */
export const DEPOT: Depot = depotJson as Depot;

/** Exactly three drivers with colorblind-friendly route colors. */
export const DRIVERS: Driver[] = driversJson as Driver[];

/** 45 pending delivery stops across Madison, WI. */
export const STOPS: Stop[] = stopsJson as Stop[];

/** Fresh deep copies so callers can mutate without touching module state. */
export function getSeed(): { depot: Depot; drivers: Driver[]; stops: Stop[] } {
  return {
    depot: structuredClone(DEPOT),
    drivers: structuredClone(DRIVERS),
    stops: structuredClone(STOPS),
  };
}
