'use client';

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
 * upcoming.
 *
 * Deliberately NO auto-scroll when `nextIndex` advances: the list sits below
 * the fold on a phone, so scrolling the new current row into view scrolled the
 * whole page and pushed the Next Stop card (the primary actions) under the
 * sticky header after two or three deliveries. The card at the top is the
 * source of truth for "what's next"; the list is reference. Rows keep
 * `scroll-mt/mb` so any programmatic or anchor scroll clears the sticky bars.
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
      <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
                // Keep the row clear of the sticky header/footer if it is ever scrolled into view.
                className="scroll-mt-20 scroll-mb-16"
              />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
