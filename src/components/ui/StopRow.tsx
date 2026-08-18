'use client';

import { Check, X } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { shortAddress } from '@/lib/geo';
import { formatWindow, to12h } from '@/lib/time';
import type { Stop } from '@/lib/types';

import { PriorityBadge } from './PriorityBadge';

export type StopRowState = 'done' | 'current' | 'upcoming' | 'default';

export interface StopRowProps {
  /** 1-based sequence number shown in the circle. */
  index: number;
  stop: Stop;
  /** Arrival "HH:MM"; rendered as 12h. */
  eta?: string;
  /** Driver color for the sequence circle / current ring (fallback slate-400). */
  color?: string;
  state?: StopRowState;
  onClick?: () => void;
  /** Extra controls on the right (menus, selects). Renders the row as a <div>. */
  rightSlot?: ReactNode;
  /** Tighter vertical padding, hides recipient. */
  compact?: boolean;
  /** dnd-kit handle (or any node) rendered at the far left. */
  dragHandle?: ReactNode;
  className?: string;
  /** Forwarded to the outer element (dnd-kit transform, etc.). */
  style?: CSSProperties;
}

const FALLBACK_COLOR = '#94a3b8'; // slate-400 (unassigned)

/**
 * A single stop in a route list. Renders as one <button> when `onClick` is
 * given and there is no `rightSlot`; when `rightSlot` is present the row is a
 * <div> with an inner <button> body so no interactive elements are nested.
 */
export function StopRow({
  index,
  stop,
  eta,
  color,
  state = 'default',
  onClick,
  rightSlot,
  compact = false,
  dragHandle,
  className,
  style,
}: StopRowProps) {
  const accent = color ?? FALLBACK_COLOR;
  const isDone = state === 'done' || stop.status !== 'pending';
  const isCurrent = state === 'current';

  const circle = (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white tabular-nums',
        stop.status === 'failed' && 'bg-red-600',
        stop.status === 'delivered' && 'bg-emerald-600',
      )}
      style={stop.status === 'pending' ? { backgroundColor: accent } : undefined}
    >
      {stop.status === 'delivered' ? (
        <Check className="size-4" strokeWidth={3} />
      ) : stop.status === 'failed' ? (
        <X className="size-4" strokeWidth={3} />
      ) : (
        index
      )}
    </span>
  );

  const body = (
    <>
      {circle}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-900">{shortAddress(stop.address)}</span>
          {stop.priority !== 'standard' && <PriorityBadge priority={stop.priority} />}
        </span>
        {!compact && <span className="block truncate text-xs text-slate-500">{stop.recipient}</span>}
        {stop.timeWindow && (
          <span className="block text-[11px] text-slate-500 tabular-nums">
            Window {formatWindow(stop.timeWindow)}
          </span>
        )}
      </span>
      {eta && (
        <span className="shrink-0 self-start pt-0.5 text-right text-sm text-slate-700 tabular-nums">
          {to12h(eta)}
        </span>
      )}
    </>
  );

  const srStatus =
    stop.status === 'delivered' ? 'Delivered. ' : stop.status === 'failed' ? 'Failed. ' : isCurrent ? 'Next stop. ' : '';
  const label = [
    `${srStatus}Stop ${index}, ${shortAddress(stop.address)}, ${stop.recipient}`,
    stop.priority !== 'standard' ? stop.priority : null,
    stop.timeWindow ? `window ${formatWindow(stop.timeWindow)}` : null,
    eta ? `ETA ${to12h(eta)}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const outerClass = cn(
    'relative flex w-full min-h-[56px] items-center gap-3 bg-white text-left transition-colors',
    compact ? 'px-3 py-1.5' : 'px-3 py-2',
    isDone && 'opacity-60',
    className,
  );
  // "Current" ring uses the driver color, which is dynamic → inline box-shadow.
  const outerStyle: CSSProperties = {
    ...style,
    ...(isCurrent ? { boxShadow: `inset 0 0 0 2px ${accent}`, backgroundColor: `${accent}14` } : {}),
  };
  const interactiveClass =
    'hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900';

  // Case 1: the whole row is a single <button> (no other interactive children).
  if (onClick && !rightSlot && !dragHandle) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-current={isCurrent ? 'step' : undefined}
        className={cn(outerClass, interactiveClass)}
        style={outerStyle}
        data-stop-id={stop.id}
      >
        {body}
      </button>
    );
  }

  // Case 2: rightSlot and/or dragHandle present → <div> wrapper; the clickable
  // body is an inner <button> so interactive elements are never nested.
  return (
    <div
      className={outerClass}
      style={outerStyle}
      data-stop-id={stop.id}
      aria-current={isCurrent ? 'step' : undefined}
    >
      {dragHandle}
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            '-mx-1 flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-lg px-1',
            interactiveClass,
          )}
        >
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      {rightSlot && <div className="flex shrink-0 items-center">{rightSlot}</div>}
    </div>
  );
}
