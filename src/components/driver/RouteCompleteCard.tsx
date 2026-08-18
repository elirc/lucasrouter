'use client';

import { ChevronRight, PartyPopper } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode, Ref } from 'react';

import { Card } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatKm } from '@/lib/geo';
import { formatDuration } from '@/lib/time';
import type { Driver, Route, Stop } from '@/lib/types';

export interface RouteCompleteCardProps {
  route: Route;
  driver: Driver;
  stopsById: Record<string, Stop>;
  delivered: number;
  failed: number;
  /** Ref to the heading (`tabIndex={-1}`) so the parent can focus it when the route completes. */
  headingRef?: Ref<HTMLHeadingElement>;
  className?: string;
}

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-[11px] font-medium tracking-wide text-slate-600 uppercase">{label}</dt>
      <dd className={cn('mt-0.5 text-lg font-semibold text-slate-900 tabular-nums', tone)}>{value}</dd>
    </div>
  );
}

/**
 * Shown in place of the next-stop card once every stop is delivered or
 * failed: outcome counts, packages delivered, planned time + distance and a
 * link back to the driver picker.
 */
export function RouteCompleteCard({
  route,
  driver,
  stopsById,
  delivered,
  failed,
  headingRef,
  className,
}: RouteCompleteCardProps) {
  const packagesDelivered = route.stopIds.reduce((sum, id) => {
    const s = stopsById[id];
    return s && s.status === 'delivered' ? sum + s.packages : sum;
  }, 0);

  return (
    <Card
      role="region"
      aria-labelledby="route-complete-heading"
      className={cn('driver-fade-in p-4', className)}
      style={{ borderLeftColor: driver.color, borderLeftWidth: 4 }}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"
        >
          <PartyPopper className="size-6" />
        </span>
        <div className="min-w-0">
          <h2
            id="route-complete-heading"
            ref={headingRef}
            tabIndex={-1}
            className="rounded-sm text-xl font-semibold leading-tight text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          >
            Route complete <span aria-hidden="true">🎉</span>
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Nice work, {driver.name.split(' ')[0]}. Head back to the depot when you are ready.
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Delivered" value={delivered} tone="text-emerald-700" />
        <Stat label="Failed" value={failed} tone={failed > 0 ? 'text-red-700' : undefined} />
        <Stat label="Packages delivered" value={packagesDelivered} />
        <Stat label="Route time" value={formatDuration(route.totalMinutes)} />
        <Stat label="Planned distance" value={formatKm(route.totalDistanceKm)} />
        <Stat label="Stops" value={route.stopIds.length} />
      </dl>

      <Link
        href="/driver"
        className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      >
        Back to drivers
        <ChevronRight className="size-4 text-slate-400" aria-hidden="true" />
      </Link>
    </Card>
  );
}
