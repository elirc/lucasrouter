'use client';

// Route drawing: a white halo under a coloured line, plus small direction
// arrows at leg midpoints. One `RoutePolyline` per driver route; the
// `RoutePolylines` list handles visibility filtering and the global arrow cap.

import { memo, useEffect, useMemo, useState } from 'react';
import { Marker, Polyline, Tooltip } from 'react-leaflet';
import type { PathOptions } from 'leaflet';
import type { Depot, Driver, Route, Stop } from '@/lib/types';
import type { LatLngTuple } from '@/lib/geo';
import { arrowIcon } from './icons';
import { legMidpoint, legPositions, loadRoadPaths, roadPathsReady, routePositions, sampleEvenly } from './mapMath';

/** Legs shorter than this get no direction arrow (too cluttered). */
const MIN_ARROW_LEG_METERS = 700;
/** Upper bound on arrows across all routes on screen. */
export const MAX_ARROWS_TOTAL = 60;

export type RouteVariant = 'normal' | 'faint' | 'bold';

export interface RoutePolylineProps {
  route: Route;
  driver: Driver;
  depot: Depot;
  stopsById: Record<string, Stop>;
  /** normal = dispatch view; faint = context route in focus mode; bold = highlighted leg. */
  variant?: RouteVariant;
  /** Draw direction arrows (normal variant only). Default true. */
  showArrows?: boolean;
  /** Max arrows for this route (list component divides the global cap). */
  arrowBudget?: number;
  /**
   * When set, only these legs are drawn (used for the bold focus leg). Legs
   * are matched on `fromId`/`toId`.
   */
  onlyLeg?: { fromId: string; toId: string } | null;
}

interface StyleSet {
  halo: PathOptions | null;
  main: PathOptions;
}

function stylesFor(variant: RouteVariant, color: string): StyleSet {
  switch (variant) {
    case 'faint':
      return {
        halo: null,
        main: {
          color,
          weight: 3,
          opacity: 0.3,
          dashArray: '6 8',
          lineJoin: 'round',
          lineCap: 'round',
        },
      };
    case 'bold':
      return {
        halo: { color: '#ffffff', weight: 10, opacity: 0.8, lineJoin: 'round', lineCap: 'round' },
        main: { color, weight: 6, opacity: 1, lineJoin: 'round', lineCap: 'round' },
      };
    case 'normal':
    default:
      return {
        halo: { color: '#ffffff', weight: 7, opacity: 0.6, lineJoin: 'round', lineCap: 'round' },
        main: { color, weight: 4, opacity: 0.85, lineJoin: 'round', lineCap: 'round' },
      };
  }
}

interface ArrowSpec {
  key: string;
  position: LatLngTuple;
  bearing: number;
}

const NO_POSITIONS: LatLngTuple[] = [];

/**
 * `true` once the precomputed road geometry is in memory. Mounting a polyline
 * is the signal that it is needed, so the chunk is only fetched by users who
 * actually have a plan on screen — and the first line drawn is already
 * road-shaped instead of a straight segment that snaps a frame later.
 */
function useRoadPaths(): boolean {
  const [ready, setReady] = useState(roadPathsReady());
  useEffect(() => {
    if (ready) return;
    let active = true;
    void loadRoadPaths().then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, [ready]);
  return ready;
}

function RoutePolylineImpl({
  route,
  driver,
  depot,
  stopsById,
  variant = 'normal',
  showArrows = true,
  arrowBudget = MAX_ARROWS_TOTAL,
  onlyLeg = null,
}: RoutePolylineProps) {
  const roadsReady = useRoadPaths();

  const positions = useMemo<LatLngTuple[]>(() => {
    if (!roadsReady) return NO_POSITIONS; // nothing drawn until the geometry is in
    if (onlyLeg) {
      const leg =
        route.legs.find((l) => l.fromId === onlyLeg.fromId && l.toId === onlyLeg.toId) ??
        // Fallback: synthesize a straight leg if the pair isn't in `legs`.
        { fromId: onlyLeg.fromId, toId: onlyLeg.toId, distanceKm: 0, driveMinutes: 0 };
      return legPositions(leg, depot, stopsById);
    }
    return routePositions(route, depot, stopsById);
  }, [roadsReady, route, depot, stopsById, onlyLeg]);

  const styles = useMemo(() => stylesFor(variant, driver.color), [variant, driver.color]);

  const arrows = useMemo<ArrowSpec[]>(() => {
    if (!roadsReady || variant !== 'normal' || !showArrows || onlyLeg) return [];
    const candidates: ArrowSpec[] = [];
    route.legs.forEach((leg, i) => {
      const mid = legMidpoint(legPositions(leg, depot, stopsById));
      if (!mid || mid.lengthMeters < MIN_ARROW_LEG_METERS) return;
      candidates.push({ key: `${leg.fromId}-${leg.toId}-${i}`, position: mid.position, bearing: mid.bearing });
    });
    return sampleEvenly(candidates, arrowBudget);
  }, [roadsReady, route, depot, stopsById, variant, showArrows, arrowBudget, onlyLeg]);

  if (positions.length < 2) return null;

  const stopCount = route.stopIds.length;

  return (
    <>
      {styles.halo ? (
        <Polyline positions={positions} pathOptions={styles.halo} interactive={false} />
      ) : null}
      <Polyline positions={positions} pathOptions={styles.main} interactive={variant === 'normal'}>
        {variant === 'normal' ? (
          <Tooltip sticky direction="top" opacity={0.95}>
            <span className="text-xs font-medium text-slate-900">{driver.name}</span>
            <span className="text-xs text-slate-500">
              {' '}
              · {stopCount} {stopCount === 1 ? 'stop' : 'stops'}
            </span>
          </Tooltip>
        ) : null}
      </Polyline>
      {arrows.map((a) => (
        <Marker
          key={a.key}
          position={a.position}
          icon={arrowIcon(a.bearing, driver.color)}
          interactive={false}
          keyboard={false}
          zIndexOffset={-1000}
        />
      ))}
    </>
  );
}

/** Memoised single-route layer (halo + line + arrows). */
export const RoutePolyline = memo(RoutePolylineImpl);
RoutePolyline.displayName = 'RoutePolyline';

// ---------------------------------------------------------------------------

export interface RoutePolylinesProps {
  routes: Route[];
  drivers: Driver[];
  depot: Depot;
  stopsById: Record<string, Stop>;
  hiddenDriverIds?: string[];
  showArrows?: boolean;
}

function RoutePolylinesImpl({
  routes,
  drivers,
  depot,
  stopsById,
  hiddenDriverIds = [],
  showArrows = true,
}: RoutePolylinesProps) {
  const visible = useMemo(() => {
    const hidden = new Set(hiddenDriverIds);
    const byId = new Map(drivers.map((d) => [d.id, d] as const));
    const out: { route: Route; driver: Driver }[] = [];
    for (const route of routes) {
      if (hidden.has(route.driverId) || route.stopIds.length === 0) continue;
      const driver = byId.get(route.driverId);
      if (!driver) continue;
      out.push({ route, driver });
    }
    return out;
  }, [routes, drivers, hiddenDriverIds]);

  const budget = visible.length > 0 ? Math.max(1, Math.floor(MAX_ARROWS_TOTAL / visible.length)) : 0;

  return (
    <>
      {visible.map(({ route, driver }) => (
        <RoutePolyline
          key={route.driverId}
          route={route}
          driver={driver}
          depot={depot}
          stopsById={stopsById}
          variant="normal"
          showArrows={showArrows}
          arrowBudget={budget}
        />
      ))}
    </>
  );
}

/** All visible routes in dispatch mode (skips hidden drivers and empty routes). */
export const RoutePolylines = memo(RoutePolylinesImpl);
RoutePolylines.displayName = 'RoutePolylines';
