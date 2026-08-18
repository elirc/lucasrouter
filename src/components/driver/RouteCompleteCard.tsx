'use client';

import { ChevronRight, FileDown, PartyPopper } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode, Ref } from 'react';

import { Button, Card } from '@/components/ui';
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
  /** Stops moved to the end of the route today (from the activity log). */
  deferred: number;
  /**
   * Wall-clock minutes between the first and the last recorded event — what
   * the day actually took, next to what was planned. 0 when the route was
   * completed without any recorded event (e.g. progress from another device).
   */
  actualMinutes: number;
  /** Download the per-stop CSV / the raw event JSON. */
  onDownloadCsv: () => void;
  onDownloadJson: () => void;
  /** Ref to the heading (`tabIndex={-1}`) so the parent can focus it when the route completes. */
  headingRef?: Ref<HTMLHeadingElement>;
  className?: string;
}

function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-[11px] font-medium tracking-wide text-slate-600 uppercase">{label}</dt>
      <dd className={cn('mt-0.5 text-lg font-semibold text-slate-900 tabular-nums', tone)}>
        {value}
        {hint && <span className="block text-[11px] font-normal text-slate-600 tabular-nums">{hint}</span>}
      </dd>
    </div>
  );
}

/**
 * Shown in place of the next-stop card once every stop is delivered or failed:
 * the day's outcome counts, packages delivered, actual vs planned time, and
 * the end-of-day report downloads (CSV per stop, JSON per event).
 */
export function RouteCompleteCard({
  route,
  driver,
  stopsById,
  delivered,
  failed,
  deferred,
  actualMinutes,
  onDownloadCsv,
  onDownloadJson,
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
        <Stat label="Skipped" value={deferred} tone={deferred > 0 ? 'text-amber-800' : undefined} />
        <Stat
          label="Time on route"
          value={actualMinutes > 0 ? formatDuration(actualMinutes) : '—'}
          hint={`planned ${formatDuration(route.totalMinutes)}`}
        />
        <Stat label="Planned distance" value={formatKm(route.totalDistanceKm)} hint={`${route.stopIds.length} stops`} />
      </dl>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <Button icon={<FileDown className="size-4" />} onClick={onDownloadCsv}>
          Download report
        </Button>
        <Button variant="secondary" onClick={onDownloadJson} aria-label="Download today's events as JSON">
          JSON
        </Button>
      </div>

      <Link
        href="/driver"
        className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      >
        Back to drivers
        <ChevronRight className="size-4 text-slate-400" aria-hidden="true" />
      </Link>
    </Card>
  );
}
