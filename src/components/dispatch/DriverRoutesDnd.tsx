'use client';

// Desktop drag & drop for the dispatcher panel.
//
// dnd-kit (~50 KB of JavaScript) only ever runs on a pointer-and-keyboard
// viewport — on phones stops are moved with the ⋯ menu — so it lives in this
// module alone and DriverRoutes loads it with `React.lazy` when the viewport is
// md+. Phones render exactly the same cards with `slots === null` and never
// request the chunk.
//
// One `DndContext` around all cards, one `SortableContext` per driver and a
// droppable wrapper per card so an empty (or collapsed) route can accept drops.
// Cross-container drags are resolved on `onDragEnd` only (no live re-parenting)
// — simple and always consistent with the store.

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
  type Active,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Over,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useCallback, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { StopRow } from '@/components/ui';
import { cn } from '@/lib/cn';
import { shortAddress } from '@/lib/geo';
import type { Driver, Stop } from '@/lib/types';

import type { CrossHover, DragSlots, RenderCards, StopLocation } from './dragSlots';
import { SortableStopRow } from './SortableStopRow';
import type { InsertionSide } from './StopListItem';

const CONTAINER_PREFIX = 'driver:';
const containerId = (driverId: string) => `${CONTAINER_PREFIX}${driverId}`;
const driverIdFromContainer = (id: UniqueIdentifier): string | null => {
  const s = String(id);
  return s.startsWith(CONTAINER_PREFIX) ? s.slice(CONTAINER_PREFIX.length) : null;
};

/**
 * Pointer drags: only whatever the pointer is actually inside (a row, or an
 * empty card body) counts — releasing over the map, the panel header or the
 * gaps between cards drops on nothing and is a no-op, never "the nearest
 * route" (`closestCenter` always returns something). Rows are small so
 * `pointerWithin` ranks them ahead of their enclosing card container.
 * Keyboard drags have no pointer coordinates, so they use closest-centre.
 */
const collisionDetection: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);

/**
 * Before/after decision for a cross-driver drop on a row: compare the dragged
 * card's centre (its DragOverlay rect, i.e. what the user sees) with the row's
 * centre. Used for BOTH the hover line and the drop, so they always agree.
 */
function sideFor(active: Active, over: Over): InsertionSide {
  const dragged = active.rect.current.translated;
  if (!dragged) return 'before';
  const draggedCenter = dragged.top + dragged.height / 2;
  const overCenter = over.rect.top + over.rect.height / 2;
  return draggedCenter > overCenter ? 'after' : 'before';
}

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
      data-driver-card={driverId}
      className={cn('rounded-xl transition-shadow', highlighted && 'shadow-[0_0_0_2px_var(--drop-ring)]')}
      style={{ '--drop-ring': color } as CSSProperties}
    >
      {children}
    </div>
  );
}

/** One driver's rows as a sortable list. */
function SortableList({ stopIds, children }: { stopIds: string[]; children: ReactNode }) {
  return (
    <SortableContext items={stopIds} strategy={verticalListSortingStrategy}>
      {children}
    </SortableContext>
  );
}

export interface DriverRoutesDndProps {
  stopsById: Record<string, Stop>;
  driversById: Record<string, Driver>;
  locationByStopId: Record<string, StopLocation>;
  /** Same handler the ⋯ menu uses, so a drop and a menu move are one code path. */
  onMove: (stopId: string, toDriverId: string, index?: number) => void;
  children: RenderCards;
}

/**
 * Wraps the driver cards in a `DndContext` and hands them the sortable row /
 * droppable card slots. Rendering stays in DriverRoutes: this component only
 * owns drag state and the drop resolution.
 */
export default function DriverRoutesDnd({
  stopsById,
  driversById,
  locationByStopId,
  onMove,
  children,
}: DriverRoutesDndProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // Hover target while dragging (drives the drop ring + insertion line). The
  // ref mirrors the state so onDragEnd reads the exact side that was drawn.
  const [hover, setHover] = useState<CrossHover | null>(null);
  const hoverRef = useRef<CrossHover | null>(null);
  const updateHover = useCallback((next: CrossHover | null) => {
    const prev = hoverRef.current;
    const same =
      prev === next ||
      (prev !== null &&
        next !== null &&
        prev.driverId === next.driverId &&
        prev.stopId === next.stopId &&
        prev.side === next.side);
    if (same) return; // unchanged → no re-render on every pointer move
    hoverRef.current = next;
    setHover(next);
  }, []);

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

  /** Recompute the hover target from the current `over` (+ dragged rect). */
  const trackHover = useCallback(
    (active: Active, over: Over | null) => {
      const target = over ? resolveOver(over.id) : null;
      if (!over || !target) {
        updateHover(null);
        return;
      }
      updateHover({
        driverId: target.driverId,
        stopId: target.index === undefined ? null : String(over.id),
        side: target.index === undefined ? 'before' : sideFor(active, over),
      });
    },
    [resolveOver, updateHover],
  );

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    updateHover(null);
  };

  // dnd-kit fires onDragOver only when the `over` id changes; the side within a
  // row moves with the pointer, so it is refreshed on every onDragMove too.
  const onDragOver = (e: DragOverEvent) => trackHover(e.active, e.over);
  const onDragMove = (e: DragMoveEvent) => trackHover(e.active, e.over);

  const onDragCancel = () => {
    setActiveId(null);
    updateHover(null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    const drawn = hoverRef.current;
    setActiveId(null);
    updateHover(null);
    if (!over) return; // released outside every row/card → cancel

    const stopId = String(active.id);
    const from = locationByStopId[stopId];
    const target = resolveOver(over.id);
    if (!from || !target) return;

    let index = target.index;
    if (target.driverId === from.driverId) {
      // Dropped on the own card's header/padding (no row under the pointer):
      // there is no sensible position to infer — treat as a cancel rather than
      // silently appending to the end.
      if (index === undefined) return;
      // Reorder within one route: dnd-kit's `over` is the row whose slot the
      // item takes (arrayMove semantics == moveStop's remove-then-insert).
      if (index === from.index) return; // dropped where it started
      onMove(stopId, target.driverId, index);
      return;
    }
    if (index !== undefined) {
      // Cross-driver drop on a row: insert on the side the hover line showed
      // (recomputed only if the last drawn hover was for a different row).
      const side = drawn && drawn.stopId === String(over.id) ? drawn.side : sideFor(active, over);
      if (side === 'after') index += 1;
    }
    onMove(stopId, target.driverId, index);
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

  const slots = useMemo<DragSlots>(
    () => ({ Row: SortableStopRow, List: SortableList, Card: DroppableCard, hover, draggingDriverId, activeId }),
    [hover, draggingDriverId, activeId],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{ announcements }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {children(slots)}
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
