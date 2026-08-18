// Contract between DriverRoutes (which owns the markup) and the desktop-only
// drag & drop layer (DriverRoutesDnd, which owns dnd-kit). Deliberately free of
// any dnd-kit import so that rendering the cards on a phone never pulls the
// package into the dispatcher's bundle — see DriverRoutesDnd for the why.

import type { ComponentType, ReactNode } from 'react';

import type { InsertionSide, StopListItemProps } from './StopListItem';

/** Where a stop currently sits in the plan. */
export interface StopLocation {
  driverId: string;
  index: number;
}

/** Row currently hovered by a drag, and which side of it a drop would use. */
export interface CrossHover {
  driverId: string;
  stopId: string | null;
  side: InsertionSide;
}

/** Props of the sortable row (StopListItem plus the drag handle wiring). */
export type DraggableRowProps = Omit<StopListItemProps, 'dragHandle' | 'setNodeRef' | 'style' | 'isDragging'>;

/**
 * The drag & drop pieces DriverRoutes splices into its cards. `null` means "no
 * drag & drop" (phones), and every slot below is then simply not rendered.
 */
export interface DragSlots {
  /** Replaces StopListItem: same row, wired to `useSortable`. */
  Row: ComponentType<DraggableRowProps>;
  /** Wraps one driver's `<ol>` so its rows are a sortable list. */
  List: ComponentType<{ stopIds: string[]; children: ReactNode }>;
  /** Wraps a whole card so a collapsed or empty route still accepts drops. */
  Card: ComponentType<{ driverId: string; color: string; highlighted: boolean; children: ReactNode }>;
  /** Current hover target, or null when nothing is being dragged over a row. */
  hover: CrossHover | null;
  /** Driver whose route the dragged stop came from; null while idle. */
  draggingDriverId: string | null;
  /** Non-null while a drag is in progress. */
  activeId: string | null;
}

/** Renders the driver cards. Called with `null` on phones. */
export type RenderCards = (slots: DragSlots | null) => ReactNode;
