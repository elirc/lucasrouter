'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Wand2 } from 'lucide-react';
import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import { DriverCard, StopRow } from '@/components/ui';
import { cn } from '@/lib/cn';
import { shortAddress } from '@/lib/geo';
import type { Driver, Route, Stop } from '@/lib/types';
import { useAppStore } from '@/store/useAppStore';

import { SortableStopRow } from './SortableStopRow';
import { StopListItem } from './StopListItem';

export interface DriverRoutesProps {
  /** Desktop enables drag & drop and expands every card by default. */
  isDesktop: boolean;
  /** Row body click (the screen selects the stop and, on mobile, shrinks the sheet). */
  onActivateStop: (stopId: string) => void;
}

/** Where a stop currently sits. */
interface StopLocation {
  driverId: string;
  index: number;
}

const CONTAINER_PREFIX = 'driver:';
const containerId = (driverId: string) => `${CONTAINER_PREFIX}${driverId}`;
const driverIdFromContainer = (id: UniqueIdentifier): string | null => {
  const s = String(id);
  return s.startsWith(CONTAINER_PREFIX) ? s.slice(CONTAINER_PREFIX.length) : null;
};

/**
 * Prefer whatever the pointer is actually inside (a row, or an empty card
 * body); fall back to closest-centre for keyboard dragging, where there is no
 * pointer. Rows are small so `pointerWithin` ranks them ahead of their
 * enclosing card container.
 */
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : closestCenter(args);
};

/**
 * The per-driver route cards. Reads the store directly (narrow selectors) so
 * panel-only interactions (expand/collapse, menus, drags) never touch the map.
 *
 * Desktop: one `DndContext` around all cards, one `SortableContext` per driver
 * and a droppable wrapper per card so an empty (or collapsed) route can accept
 * drops. Cross-container drags are resolved on `onDragEnd` only (no live
 * re-parenting) — simple and always consistent with the store.
 * Mobile: same cards, no DnD; the ⋯ menu does the moving.
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

      moveStop(stopId, toDriverId, index);

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

  // ---- drag & drop (desktop) ---------------------------------------------------------
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overDriverId, setOverDriverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeStop = activeId ? stopsById[activeId] : undefined;
  const draggingDriverId = activeId ? (locationByStopId[activeId]?.driverId ?? null) : null;

  /** Resolve an `over` id (row or container) to a driver + optional index. */
  const resolveOver = useCallback(
    (overId: UniqueIdentifier): { driverId: string; index?: number } | null => {
      const asContainer = driverIdFromContainer(overId);
      if (asContainer) return { driverId: asContainer };
      const loc = locationByStopId[String(overId)];
      return loc ? { driverId: loc.driverId, index: loc.index } : null;
    },
    [locationByStopId],
  );

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setOverDriverId(locationByStopId[String(e.active.id)]?.driverId ?? null);
  };

  const onDragOver = (e: DragOverEvent) => {
    setOverDriverId(e.over ? (resolveOver(e.over.id)?.driverId ?? null) : null);
  };

  const onDragCancel = () => {
    setActiveId(null);
    setOverDriverId(null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    setOverDriverId(null);
    if (!over) return;

    const stopId = String(active.id);
    const from = locationByStopId[stopId];
    const target = resolveOver(over.id);
    if (!from || !target) return;

    let index = target.index;
    if (target.driverId === from.driverId) {
      // Reorder within one route: dnd-kit's `over` is the row whose slot the
      // item takes (arrayMove semantics == moveStop's remove-then-insert).
      const len = routeByDriverId[from.driverId]?.stopIds.length ?? 0;
      const finalIndex = index === undefined ? Math.max(0, len - 1) : index;
      if (finalIndex === from.index) return; // dropped where it started
      handleMove(stopId, target.driverId, index);
      return;
    }
    if (index !== undefined) {
      // Cross-driver drop on a row: insert before or after it depending on
      // where the dragged item's centre landed relative to the row's centre.
      const dragged = active.rect.current.translated;
      if (dragged) {
        const draggedCenter = dragged.top + dragged.height / 2;
        const overCenter = over.rect.top + over.rect.height / 2;
        if (draggedCenter > overCenter) index += 1;
      }
    }
    handleMove(stopId, target.driverId, index);
  };

  const announcements = useMemo<Announcements>(() => {
    const nameOf = (id: UniqueIdentifier): string => {
      const d = driverIdFromContainer(id);
      if (d) return `${driversById[d]?.name ?? d}'s route`;
      const s = stopsById[String(id)];
      return s ? shortAddress(s.address) : String(id);
    };
    return {
      onDragStart: ({ active }) =>
        `Picked up ${nameOf(active.id)}. Use the arrow keys to move it, space to drop, escape to cancel.`,
      onDragOver: ({ active, over }) =>
        over ? `${nameOf(active.id)} is over ${nameOf(over.id)}.` : `${nameOf(active.id)} is no longer over a route.`,
      onDragEnd: ({ active, over }) =>
        over ? `${nameOf(active.id)} was dropped on ${nameOf(over.id)}.` : `${nameOf(active.id)} was dropped.`,
      onDragCancel: ({ active }) => `Dragging ${nameOf(active.id)} was cancelled.`,
    };
  }, [driversById, stopsById]);

  // ---- render ---------------------------------------------------------------------------
  const cards = drivers.map((driver, i) => {
    const route = routeByDriverId[driver.id];
    const expanded = isExpanded(driver.id, i);
    const stopIds = route?.stopIds ?? [];

    const rows: ReactNode = !route ? (
      <NoRouteYet />
    ) : stopIds.length === 0 ? (
      <p className="px-4 py-4 text-sm text-slate-500">
        No stops assigned{isDesktop ? ' — drag a stop here or use a stop’s ⋯ menu.' : '.'}
      </p>
    ) : (
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
            disabled: isOptimizing,
            onActivate: onActivateStop,
            onMove: handleMove,
          };
          return isDesktop ? (
            <SortableStopRow key={stopId} {...shared} draggingDriverId={draggingDriverId} />
          ) : (
            <StopListItem key={stopId} {...shared} />
          );
        })}
      </ol>
    );

    const card = (
      <DriverCard
        driver={driver}
        route={route}
        stopsById={stopsById}
        expanded={expanded}
        onToggle={() => setExplicitExpanded((prev) => ({ ...prev, [driver.id]: !expanded }))}
      >
        {isDesktop ? (
          <SortableContext items={stopIds} strategy={verticalListSortingStrategy}>
            {rows}
          </SortableContext>
        ) : (
          rows
        )}
      </DriverCard>
    );

    return isDesktop ? (
      <DroppableCard
        key={driver.id}
        driverId={driver.id}
        color={driver.color}
        highlighted={activeId !== null && overDriverId === driver.id && draggingDriverId !== driver.id}
      >
        {card}
      </DroppableCard>
    ) : (
      <div key={driver.id}>{card}</div>
    );
  });

  if (!isDesktop) {
    return <div className="space-y-3">{cards}</div>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{ announcements }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="space-y-3">{cards}</div>
      <DragOverlay dropAnimation={null}>
        {activeStop && draggingDriverId ? (
          <div className="rounded-lg bg-white shadow-xl ring-1 ring-slate-300">
            <StopRow
              index={(locationByStopId[activeStop.id]?.index ?? 0) + 1}
              stop={activeStop}
              color={driversById[draggingDriverId]?.color}
              compact
              className="rounded-lg"
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------

/** Wraps a whole card in a droppable so collapsed/empty routes accept drops (append). */
function DroppableCard({
  driverId,
  color,
  highlighted,
  children,
}: {
  driverId: string;
  color: string;
  highlighted: boolean;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: containerId(driverId), data: { type: 'container', driverId } });
  return (
    <div
      ref={setNodeRef}
      className={cn('rounded-xl transition-shadow', highlighted && 'shadow-[0_0_0_2px_var(--drop-ring)]')}
      style={{ '--drop-ring': color } as CSSProperties}
    >
      {children}
    </div>
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
