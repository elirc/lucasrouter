'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { CSSProperties } from 'react';

import { cn } from '@/lib/cn';
import { shortAddress } from '@/lib/geo';

import { StopListItem, type StopListItemProps } from './StopListItem';

export type SortableStopRowProps = Omit<
  StopListItemProps,
  'dragHandle' | 'setNodeRef' | 'style' | 'isDragging'
>;

/**
 * Desktop row: `StopListItem` wired to `useSortable`. The GripVertical button
 * is the only drag activator (so the row body stays a normal click target and
 * the ⋯ menu keeps working). `insertionHint` (from DriverRoutes, which knows
 * the hovered row AND the before/after side) draws the line for cross-driver
 * hovers — same-driver drags get dnd-kit's own shifting animation.
 */
export function SortableStopRow(props: SortableStopRowProps) {
  const { stop, driver, disabled } = props;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id: stop.id,
      disabled,
      data: { type: 'stop', driverId: driver.id },
    });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

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
      {...props}
      dragHandle={handle}
      setNodeRef={setNodeRef}
      style={style}
      isDragging={isDragging}
    />
  );
}
