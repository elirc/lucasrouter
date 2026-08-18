'use client';

import { useEffect, useRef } from 'react';

import { StopRow, type StopRowState } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Driver, Route, Stop } from '@/lib/types';

export interface DriverStopListProps {
  route: Route;
  driver: Driver;
  stopsById: Record<string, Stop>;
  /** Index (route order) of the next pending stop; -1 when complete. */
  nextIndex: number;
  remaining: number;
  onSelectStop: (stopId: string) => void;
  className?: string;
}

/**
 * Ordered list of the driver's stops. Done stops are dimmed, the next pending
 * stop is ringed in the driver's colour (`aria-current="step"`), the rest are
 * upcoming. Whenever `nextIndex` changes after mount the current row is
 * scrolled into view (`block: 'nearest'`); the initial render is left alone so
 * the page opens on the next-stop card, not the list.
 */
export function DriverStopList({
  route,
  driver,
  stopsById,
  nextIndex,
  remaining,
  onSelectStop,
  className,
}: DriverStopListProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const prevNextIndexRef = useRef<number | null>(null);
  const nextStopId = nextIndex >= 0 ? route.stopIds[nextIndex] : null;

  useEffect(() => {
    const prev = prevNextIndexRef.current;
    prevNextIndexRef.current = nextIndex;
    if (prev === null || prev === nextIndex || !nextStopId) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-stop-id="${nextStopId}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [nextIndex, nextStopId]);

  const total = route.stopIds.length;

  return (
    <section aria-labelledby="driver-route-heading" className={cn('flex flex-col', className)}>
      <div className="flex items-baseline justify-between px-1 pb-2">
        <h2 id="driver-route-heading" className="text-base font-semibold text-slate-900">
          Route
        </h2>
        <p className="text-sm text-slate-600 tabular-nums">
          {remaining === 0 ? 'All done' : `${remaining} of ${total} remaining`}
        </p>
      </div>
      <ol
        ref={listRef}
        className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        {route.stopIds.map((id, i) => {
          const stop = stopsById[id];
          if (!stop) return null;
          const state: StopRowState =
            stop.status !== 'pending' ? 'done' : i === nextIndex ? 'current' : 'upcoming';
          return (
            <li key={id}>
              <StopRow
                index={i + 1}
                stop={stop}
                eta={route.etaByStopId[id]}
                color={driver.color}
                state={state}
                onClick={() => onSelectStop(id)}
                // Keep the row clear of the sticky header/footer when scrolled into view.
                className="scroll-mt-20 scroll-mb-16"
              />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
