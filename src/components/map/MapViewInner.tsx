'use client';

// The real Leaflet map (client only — loaded through MapView's next/dynamic).
// Composes: tiles, depot, stop markers, route polylines, legend-driven
// visibility, dispatch fit-to-bounds and driver "focus leg" mode.

import 'leaflet/dist/leaflet.css';
import './map.css';

import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, TileLayer, ZoomControl, AttributionControl } from 'react-leaflet';
import type { Driver, Route, Stop } from '@/lib/types';
import { MADISON_CENTER, type LatLng, type LatLngTuple } from '@/lib/geo';
import { cn } from '@/lib/cn';
import type { MapViewProps } from './MapView';
import { setupLeaflet } from './leafletSetup';
import { hereIcon } from './icons';
import { StopMarker } from './StopMarker';
import { DepotMarker } from './DepotMarker';
import { RoutePolyline, RoutePolylines } from './RoutePolyline';
import { FitBounds, FocusFit } from './FitBounds';
import { resolvePoint } from './mapMath';

// Neutralise Leaflet's default icon URLs before any marker is created.
setupLeaflet();

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const MAP_STYLE = { height: '100%', width: '100%' } as const;
const EMPTY_IDS: string[] = [];

/** Per-stop derived data for rendering markers. */
interface StopRender {
  stop: Stop;
  driverId: string | null;
  color: string | undefined;
  seq: number | null;
  eta: string | null;
}

/**
 * Stable-callback helper: returns a memoised function that always calls the
 * latest `fn`. Lets us hand StopMarker (React.memo) a stable prop even when
 * pages pass inline lambdas.
 */
function useStableCallback<A extends unknown[]>(
  fn: ((...args: A) => void) | undefined,
): (...args: A) => void {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  }, [fn]);
  return useCallback((...args: A) => {
    ref.current?.(...args);
  }, []);
}

function MapViewInner({
  depot,
  stops,
  drivers,
  routes,
  hiddenDriverIds = EMPTY_IDS,
  selectedStopId = null,
  onSelectStop,
  onReassign,
  focus = null,
  fitKey,
  showSequenceNumbers,
  className,
  fitPadding,
  zoomControlPosition = 'topright',
  attributionPosition = 'bottomright',
  showDirectionArrows = true,
}: MapViewProps) {
  // ---- lookups ------------------------------------------------------------
  const stopsById = useMemo(() => {
    const out: Record<string, Stop> = {};
    for (const s of stops) out[s.id] = s;
    return out;
  }, [stops]);

  const driversById = useMemo(() => {
    const out: Record<string, Driver> = {};
    for (const d of drivers) out[d.id] = d;
    return out;
  }, [drivers]);

  const routesByDriver = useMemo(() => {
    const out: Record<string, Route> = {};
    for (const r of routes ?? []) out[r.driverId] = r;
    return out;
  }, [routes]);

  const hasRoutes = !!routes && routes.some((r) => r.stopIds.length > 0);
  const numbered = showSequenceNumbers ?? hasRoutes;

  /** stopId -> { driverId, seq, eta } from the current routes. */
  const assignment = useMemo(() => {
    const out: Record<string, { driverId: string; seq: number; eta: string | null }> = {};
    for (const r of routes ?? []) {
      r.stopIds.forEach((id, i) => {
        out[id] = { driverId: r.driverId, seq: i + 1, eta: r.etaByStopId[id] ?? null };
      });
    }
    return out;
  }, [routes]);

  // ---- focus mode ---------------------------------------------------------
  const focusDriver = focus ? driversById[focus.driverId] : undefined;
  const focusRoute = focus ? routesByDriver[focus.driverId] : undefined;
  const focusActive = !!focus && !!focusDriver;

  const focusFrom = useMemo<LatLngTuple | null>(
    () => (focus ? resolvePoint(focus.fromId, depot, stopsById) : null),
    [focus, depot, stopsById],
  );
  const focusTo = useMemo<LatLngTuple | null>(
    () => (focus ? resolvePoint(focus.toId, depot, stopsById) : null),
    [focus, depot, stopsById],
  );
  const focusKey = focus ? `${focus.driverId}|${focus.fromId}|${focus.toId}` : '';
  const focusLeg = useMemo(
    () => (focus ? { fromId: focus.fromId, toId: focus.toId } : null),
    [focus],
  );

  // ---- visible stops --------------------------------------------------------
  const hiddenSet = useMemo(() => new Set(hiddenDriverIds), [hiddenDriverIds]);

  const visibleStops = useMemo<StopRender[]>(() => {
    const out: StopRender[] = [];
    if (focusActive && focus) {
      // Driver mode: only this driver's stops (in route order when routed).
      const ids = focusRoute?.stopIds ?? [];
      for (const id of ids) {
        const stop = stopsById[id];
        if (!stop) continue;
        const a = assignment[id];
        out.push({
          stop,
          driverId: focus.driverId,
          color: focusDriver?.color,
          seq: numbered && a ? a.seq : null,
          eta: a?.eta ?? null,
        });
      }
      return out;
    }
    for (const stop of stops) {
      const a = assignment[stop.id];
      if (a && hiddenSet.has(a.driverId)) continue;
      out.push({
        stop,
        driverId: a?.driverId ?? null,
        color: a ? driversById[a.driverId]?.color : undefined,
        seq: numbered && a ? a.seq : null,
        eta: a?.eta ?? null,
      });
    }
    return out;
  }, [focusActive, focus, focusRoute, focusDriver, stops, stopsById, assignment, hiddenSet, driversById, numbered]);

  const fitPoints = useMemo<LatLng[]>(() => {
    const pts: LatLng[] = visibleStops.map((v) => ({ lat: v.stop.lat, lng: v.stop.lng }));
    pts.push({ lat: depot.lat, lng: depot.lng });
    return pts;
  }, [visibleStops, depot]);

  // ---- stable callbacks for memoised children --------------------------------
  const handleSelectStop = useStableCallback(onSelectStop);
  const handleReassign = useStableCallback(onReassign);

  return (
    <div className={cn('relative z-0 isolate overflow-hidden h-full w-full', className)}>
      <MapContainer
        center={MADISON_CENTER}
        zoom={12}
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom
        style={MAP_STYLE}
        className="h-full w-full bg-slate-100"
      >
        <TileLayer url={OSM_URL} attribution={OSM_ATTRIBUTION} maxZoom={19} />
        <ZoomControl position={zoomControlPosition} />
        <AttributionControl position={attributionPosition} />

        {/* Viewport management */}
        <FitBounds points={fitPoints} fitKey={fitKey} padding={fitPadding} disabled={focusActive} />
        {focusActive ? <FocusFit from={focusFrom} to={focusTo} focusKey={focusKey} /> : null}

        {/* Routes */}
        {focusActive && focusRoute && focusDriver ? (
          <>
            {focusRoute.stopIds.length > 0 ? (
              <RoutePolyline
                route={focusRoute}
                driver={focusDriver}
                depot={depot}
                stopsById={stopsById}
                variant="faint"
                showArrows={false}
              />
            ) : null}
            <RoutePolyline
              route={focusRoute}
              driver={focusDriver}
              depot={depot}
              stopsById={stopsById}
              variant="bold"
              showArrows={false}
              onlyLeg={focusLeg}
            />
          </>
        ) : null}
        {!focusActive && routes ? (
          <RoutePolylines
            routes={routes}
            drivers={drivers}
            depot={depot}
            stopsById={stopsById}
            hiddenDriverIds={hiddenDriverIds}
            showArrows={showDirectionArrows}
          />
        ) : null}

        {/* Depot + stops */}
        <DepotMarker depot={depot} />
        {visibleStops.map((v) => (
          <StopMarker
            key={v.stop.id}
            stop={v.stop}
            color={v.color}
            seq={v.seq}
            eta={v.eta}
            assignedDriverId={v.driverId}
            selected={selectedStopId === v.stop.id}
            drivers={drivers}
            onSelectStop={handleSelectStop}
            onReassign={onReassign ? handleReassign : undefined}
          />
        ))}

        {/* "You are here" at the start of the focus leg */}
        {focusActive && focusFrom ? <HereMarker position={focusFrom} /> : null}
      </MapContainer>
    </div>
  );
}

const HereMarker = memo(function HereMarker({ position }: { position: LatLngTuple }) {
  const icon = useMemo(() => hereIcon(), []);
  return (
    <Marker
      position={position}
      icon={icon}
      interactive={false}
      keyboard={false}
      zIndexOffset={-500}
      alt="Your current position"
      title="You are here"
    />
  );
});

export default MapViewInner;
