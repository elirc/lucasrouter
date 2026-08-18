'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { CSSProperties } from 'react';

import { cn } from '@/lib/cn';
import { shortAddress } from '@/lib/geo';

import { StopListItem, type StopListItemProps } from './StopListItem';

export interface SortableStopRowProps
  extends Omit<StopListItemProps, 'dragHandle' | 'setNodeRef' | 'style' | 'isDragging' | 'insertionHint'> {
  /** Driver id of the item currently being dragged (null when idle). */
  draggingDriverId: string | null;
}

/**
 * Desktop row: `StopListItem` wired to `useSortable`. The GripVertical button
 * is the only drag activator (so the row body stays a normal click target and
 * the ⋯ menu keeps working). Shows an insertion line when an item from a
 * *different* driver hovers over it — same-driver drags get dnd-kit's own
 * shifting animation.
 */
export function SortableStopRow({ draggingDriverId, ...rest }: SortableStopRowProps) {
  const { stop, driver, disabled } = rest;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: stop.id,
    disabled,
    data: { type: 'stop', driverId: driver.id },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const crossContainerHover = isOver && draggingDriverId !== null && draggingDriverId !== driver.id;

  const handle = (
    <button
      ref={setActivatorNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-label={`Drag to reorder ${shortAddress(stop.address)}`}
      disabled={disabled}
      className={cn(
        '-ml-1 flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-slate-400',
        'hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900',
        'disabled:cursor-not-allowed disabled:opacity-40',
        isDragging && 'cursor-grabbing',
      )}
    >
      <GripVertical className="size-4" aria-hidden="true" />
    </button>
  );

  return (
    <StopListItem
      {...rest}
      dragHandle={handle}
      setNodeRef={setNodeRef}
      style={style}
      isDragging={isDragging}
      insertionHint={crossContainerHover}
    />
  );
}
