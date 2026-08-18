'use client';

import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

import { StopRow } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Driver, Stop } from '@/lib/types';

import { MoveStopMenu } from './MoveStopMenu';

export interface StopListItemProps {
  stop: Stop;
  /** 1-based sequence number in the driver's route. */
  index: number;
  /** Total stops on this route (drives "Move to end" enablement). */
  routeLength: number;
  driver: Driver;
  drivers: Driver[];
  eta?: string;
  /** Highlighted because it is the selected stop on the map. */
  selected: boolean;
  /** Menus + drag are inert while the optimizer runs. */
  disabled: boolean;
  onActivate: (stopId: string) => void;
  onMove: (stopId: string, toDriverId: string, index?: number) => void;
  /** dnd-kit bits (desktop only). */
  dragHandle?: ReactNode;
  setNodeRef?: (el: HTMLElement | null) => void;
  style?: CSSProperties;
  isDragging?: boolean;
  /**
   * Cross-container drag hover: draw the insertion line above ('before') or
   * below ('after') the row — the same side the drop will use.
   */
  insertionHint?: InsertionSide | null;
  className?: string;
}

/** Which side of a hovered row a cross-driver drop will insert on. */
export type InsertionSide = 'before' | 'after';

/**
 * One stop inside a driver card: `StopRow` + "⋯" move menu, selection
 * highlight (driver-coloured left border on a slate-50 background) and
 * scroll-into-view when it becomes the selected stop. Rendered as an `<li>` so
 * the driver's route reads as an ordered list.
 */
export function StopListItem({
  stop,
  index,
  routeLength,
  driver,
  drivers,
  eta,
  selected,
  disabled,
  onActivate,
  onMove,
  dragHandle,
  setNodeRef,
  style,
  isDragging = false,
  insertionHint = null,
  className,
}: StopListItemProps) {
  const liRef = useRef<HTMLLIElement | null>(null);

  // Merge our own ref with dnd-kit's node ref (when sortable).
  const setRefs = useCallback(
    (el: HTMLLIElement | null) => {
      liRef.current = el;
      setNodeRef?.(el);
    },
    [setNodeRef],
  );

  // Keep the selected stop visible in the scrolling panel (map → panel sync).
  useEffect(() => {
    if (selected) liRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const isDone = stop.status !== 'pending';

  return (
    <li
      ref={setRefs}
      style={{
        ...style,
        borderLeftColor: selected ? driver.color : 'transparent',
      }}
      className={cn('relative border-l-[3px] transition-colors', isDragging && 'opacity-40', className)}
      data-stop-item={stop.id}
      data-selected={selected || undefined}
    >
      {insertionHint && (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-0 z-10 h-0.5',
            insertionHint === 'before' ? 'top-0' : 'bottom-0',
          )}
          style={{ backgroundColor: driver.color }}
        />
      )}
      <StopRow
        index={index}
        stop={stop}
        eta={eta}
        color={driver.color}
        state={isDone ? 'done' : 'default'}
        onClick={() => onActivate(stop.id)}
        dragHandle={dragHandle}
        // Inline background beats StopRow's `bg-white` without fighting the cascade.
        style={selected ? { backgroundColor: '#f8fafc' } : undefined}
        rightSlot={
          <MoveStopMenu
            stop={stop}
            drivers={drivers}
            currentDriverId={driver.id}
            index={index - 1}
            routeLength={routeLength}
            disabled={disabled}
            onMove={(toDriverId, at) => onMove(stop.id, toDriverId, at)}
          />
        }
      />
    </li>
  );
}
