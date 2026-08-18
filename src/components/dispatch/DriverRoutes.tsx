'use client';

import { Wand2 } from 'lucide-react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import { DriverCard } from '@/components/ui';
import { shortAddress } from '@/lib/geo';
import type { Driver, Route, Stop } from '@/lib/types';
import { useAppStore } from '@/store/useAppStore';

import type { DragSlots, RenderCards, StopLocation } from './dragSlots';
import { StopListItem } from './StopListItem';

/**
 * Desktop drag & drop, loaded on demand. dnd-kit is ~50 KB that a phone can
 * never use (stops move via the ⋯ menu there), so it is not part of the
 * dispatcher's bundle — it is fetched only on md+ viewports. Until it arrives
 * the same cards render without drag handles (a same-width spacer keeps the
 * rows from shifting), so the panel is readable and the ⋯ menus work from the
 * first paint.
 *
 * Not `React.lazy` + `Suspense`: that swap unmounts the fallback subtree, so a
 * ⋯ button focused before the chunk landed loses focus to <body>. Instead the
 * module is tracked in a tiny external store, the import is kicked off at
 * module evaluation on desktop (in parallel with hydration, like MapView does
 * for Leaflet), and the one focused control is re-focused across the swap.
 */
type DndModule = typeof import('./DriverRoutesDnd');
const DESKTOP_QUERY = '(min-width: 768px)';
let dndModule: DndModule | null = null;
let dndLoad: Promise<void> | null = null;
const dndListeners = new Set<() => void>();
function loadDnd(): Promise<void> {
  dndLoad ??= import('./DriverRoutesDnd').then(
    (m) => {
      dndModule = m;
      dndListeners.forEach((l) => l());
    },
    () => {
      // Chunk unavailable (offline / stale deploy): the panel simply stays
      // without drag & drop; the ⋯ menus still move stops.
    },
  );
  return dndLoad;
}
if (typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches) void loadDnd();
const subscribeDnd = (l: () => void) => {
  dndListeners.add(l);
  return () => {
    dndListeners.delete(l);
  };
};
/** The loaded dnd module, or null while it is on its way (always null on the server). */
function useDndModule(wanted: boolean): DndModule | null {
  const mod = useSyncExternalStore(
    subscribeDnd,
    () => dndModule,
    () => null,
  );
  if (wanted && !mod && typeof window !== 'undefined') void loadDnd();
  return wanted ? mod : null;
}

/**
 * Where keyboard focus sits inside the panel, as something that survives a
 * remount: the row's stop id plus the control's accessible name.
 */
function describeFocus(): { stopId: string | null; label: string } | null {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return null;
  const label = el.getAttribute('aria-label');
  if (!label) return null;
  const row = el.closest<HTMLElement>('[data-stop-item]');
  return { stopId: row?.getAttribute('data-stop-item') ?? null, label };
}

export interface DriverRoutesProps {
  /** Desktop enables drag & drop and expands every card by default. */
  isDesktop: boolean;
  /** Row body click (the screen selects the stop and, on mobile, shrinks the sheet). */
  onActivateStop: (stopId: string) => void;
}

/**
 * The per-driver route cards. Reads the store directly (narrow selectors) so
 * panel-only interactions (expand/collapse, menus, drags) never touch the map.
 *
 * This component owns the markup for both viewports; the desktop-only dnd-kit
 * wiring is spliced in through `DragSlots` (see ./dragSlots.ts).
 */
export function DriverRoutes({ isDesktop, onActivateStop }: DriverRoutesProps) {
  const drivers = useAppStore((s) => s.drivers);
  const stops = useAppStore((s) => s.stops);
  const routes = useAppStore((s) => s.routes);
  const selectedStopId = useAppStore((s) => s.selectedStopId);
  const isOptimizing = useAppStore((s) => s.isOptimizing);
  const moveStop = useAppStore((s) => s.moveStop);
  const showToast = useAppStore((s) => s.showToast);

  // ---- lookups ------------------------------------------------------------------
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

  const routeByDriverId = useMemo(() => {
    const out: Record<string, Route | undefined> = {};
    for (const r of routes ?? []) out[r.driverId] = r;
    return out;
  }, [routes]);

  const locationByStopId = useMemo(() => {
    const out: Record<string, StopLocation> = {};
    for (const r of routes ?? []) r.stopIds.forEach((id, index) => (out[id] = { driverId: r.driverId, index }));
    return out;
  }, [routes]);

  // ---- expand / collapse -----------------------------------------------------------
  // `null` entries fall back to the default (desktop: all open, mobile: first open).
  const [explicitExpanded, setExplicitExpanded] = useState<Record<string, boolean>>({});
  const isExpanded = useCallback(
    (driverId: string, i: number) => explicitExpanded[driverId] ?? (isDesktop || i === 0),
    [explicitExpanded, isDesktop],
  );

  // When the map selects a stop whose card is collapsed, open that card so the
  // row can scroll into view. Derived-state-during-render pattern (no effect).
  const [handledSelection, setHandledSelection] = useState<string | null>(null);
  if (selectedStopId !== handledSelection) {
    setHandledSelection(selectedStopId);
    if (selectedStopId) {
      const loc = locationByStopId[selectedStopId];
      const i = loc ? drivers.findIndex((d) => d.id === loc.driverId) : -1;
      if (loc && i >= 0 && !isExpanded(loc.driverId, i)) {
        setExplicitExpanded((prev) => ({ ...prev, [loc.driverId]: true }));
      }
    }
  }

  // ---- moving stops ------------------------------------------------------------------
  const handleMove = useCallback(
    (stopId: string, toDriverId: string, index?: number) => {
      const stop = stopsById[stopId];
      const to = driversById[toDriverId];
      if (!stop || !to) return;
      const from = locationByStopId[stopId];
      const targetRoute = routeByDriverId[toDriverId];

      // Only announce a move that actually happened (moveStop is a no-op for
      // unknown ids / an unchanged position and reports that).
      const moved = moveStop(stopId, toDriverId, index);
      if (!moved) return;

      const address = shortAddress(stop.address);
      if (!from || from.driverId !== toDriverId) {
        showToast(`Moved ${address} → ${to.name}`, 'success');
        return;
      }
      // Same driver: describe the new position.
      const length = targetRoute?.stopIds.length ?? 0;
      const position = index === undefined ? length : Math.max(1, Math.min(index + 1, length));
      showToast(`Moved ${address} → #${position} on ${to.name}'s route`, 'success');
    },
    [stopsById, driversById, locationByStopId, routeByDriverId, moveStop, showToast],
  );

  // ---- render ---------------------------------------------------------------------------
  // Same-width spacer where the drag handle will appear (44px + the handle's
  // -4px margin), so the rows do not shift when dnd-kit lands.
  const dnd = useDndModule(isDesktop);
  const handlePlaceholder = isDesktop && !dnd ? <span aria-hidden="true" className="-ml-1 size-11 shrink-0" /> : undefined;

  // Re-focus the control the user was on across the fallback → dnd swap. The
  // focused control is captured the moment the module resolves (the listener
  // runs synchronously in the resolve callback, before React re-renders) and
  // restored right after the swap commits. A ref, not state: nothing here
  // needs a render of its own.
  const focusToRestoreRef = useRef<ReturnType<typeof describeFocus>>(null);
  const dndReady = !!dnd;
  useLayoutEffect(() => {
    if (!isDesktop || dndReady) return;
    return subscribeDnd(() => {
      focusToRestoreRef.current = describeFocus();
    });
  }, [isDesktop, dndReady]);
  useLayoutEffect(() => {
    const pending = focusToRestoreRef.current;
    if (!dndReady || !pending) return;
    focusToRestoreRef.current = null;
    const { stopId, label } = pending;
    const scope = stopId ? document.querySelector(`[data-stop-item="${CSS.escape(stopId)}"]`) : document;
    const target =
      scope?.querySelector<HTMLElement>(`[aria-label="${CSS.escape(label)}"]`) ??
      document.querySelector<HTMLElement>(`[aria-label="${CSS.escape(label)}"]`);
    target?.focus({ preventScroll: true });
  }, [dndReady]);

  const renderCards: RenderCards = (slots) => (
    <div className="space-y-3">
      {drivers.map((driver, i) => (
        <DriverRouteCard
          key={driver.id}
          driver={driver}
          drivers={drivers}
          route={routeByDriverId[driver.id]}
          stopsById={stopsById}
          expanded={isExpanded(driver.id, i)}
          onToggleExpanded={() =>
            setExplicitExpanded((prev) => ({ ...prev, [driver.id]: !isExpanded(driver.id, i) }))
          }
          selectedStopId={selectedStopId}
          isOptimizing={isOptimizing}
          isDesktop={isDesktop}
          handlePlaceholder={handlePlaceholder}
          onActivateStop={onActivateStop}
          onMove={handleMove}
          slots={slots}
        />
      ))}
    </div>
  );

  if (!isDesktop || !dnd) return renderCards(null);

  const DriverRoutesDnd = dnd.default;
  return (
    <DriverRoutesDnd
      stopsById={stopsById}
      driversById={driversById}
      locationByStopId={locationByStopId}
      onMove={handleMove}
    >
      {renderCards}
    </DriverRoutesDnd>
  );
}

// ---------------------------------------------------------------------------

interface DriverRouteCardProps {
  driver: Driver;
  drivers: Driver[];
  route: Route | undefined;
  stopsById: Record<string, Stop>;
  expanded: boolean;
  onToggleExpanded: () => void;
  selectedStopId: string | null;
  isOptimizing: boolean;
  isDesktop: boolean;
  onActivateStop: (stopId: string) => void;
  onMove: (stopId: string, toDriverId: string, index?: number) => void;
  slots: DragSlots | null;
  /** Rendered in the drag-handle position while dnd-kit is still loading (desktop only). */
  handlePlaceholder?: ReactNode;
}

/** One driver's card: summary header plus its stops in route order. */
function DriverRouteCard({
  driver,
  drivers,
  route,
  stopsById,
  expanded,
  onToggleExpanded,
  selectedStopId,
  isOptimizing,
  isDesktop,
  onActivateStop,
  onMove,
  slots,
  handlePlaceholder,
}: DriverRouteCardProps) {
  const stopIds = route?.stopIds ?? [];

  let rows: ReactNode;
  if (!route) {
    rows = <NoRouteYet />;
  } else if (stopIds.length === 0) {
    rows = (
      <p className="px-4 py-4 text-sm text-slate-500">
        No stops assigned{isDesktop ? ' — drag a stop here or use a stop’s ⋯ menu.' : '.'}
      </p>
    );
  } else {
    rows = (
      <ol className="divide-y divide-slate-100" aria-label={`${driver.name}'s stops in order`}>
        {stopIds.map((stopId, idx) => {
          const stop = stopsById[stopId];
          if (!stop) return null;
          const shared = {
            stop,
            index: idx + 1,
            routeLength: stopIds.length,
            driver,
            drivers,
            eta: route.etaByStopId[stopId],
            selected: selectedStopId === stopId,
            // Delivered / failed stops stay put (the store refuses to move them too).
            disabled: isOptimizing || stop.status !== 'pending',
            onActivate: onActivateStop,
            onMove,
          };
          if (!slots) return <StopListItem key={stopId} {...shared} dragHandle={handlePlaceholder} />;
          // Insertion line only for cross-driver hovers (same-driver drags shift rows).
          const { hover, draggingDriverId } = slots;
          const insertionHint =
            hover && hover.stopId === stopId && draggingDriverId !== null && draggingDriverId !== driver.id
              ? hover.side
              : null;
          return <slots.Row key={stopId} {...shared} insertionHint={insertionHint} />;
        })}
      </ol>
    );
  }

  const card = (
    <DriverCard
      driver={driver}
      route={route}
      stopsById={stopsById}
      expanded={expanded}
      onToggle={onToggleExpanded}
    >
      {slots ? <slots.List stopIds={stopIds}>{rows}</slots.List> : rows}
    </DriverCard>
  );

  // `data-driver-card` lets MoveStopMenu hand focus to the target card after
  // a cross-driver move re-mounts the row elsewhere (or into a collapsed card).
  // The droppable slot sets the same attribute itself.
  if (!slots) return <div data-driver-card={driver.id}>{card}</div>;
  return (
    <slots.Card
      driverId={driver.id}
      color={driver.color}
      highlighted={
        slots.activeId !== null && slots.hover?.driverId === driver.id && slots.draggingDriverId !== driver.id
      }
    >
      {card}
    </slots.Card>
  );
}

/** Body of a driver card before the optimizer has run. */
function NoRouteYet() {
  return (
    <div className="flex items-center gap-3 px-4 py-4 text-sm text-slate-500">
      <Wand2 className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
      <span>
        No route yet · 0 stops. Tap <span className="font-medium text-slate-700">Optimize routes</span> to plan
        today&apos;s stops.
      </span>
    </div>
  );
}
