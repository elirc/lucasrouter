'use client';

import { ChevronRight, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';

import { Logo, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/time';
import type { Driver, Route, Stop } from '@/lib/types';
import { driverProgress, useAppStore, useHasHydrated } from '@/store/useAppStore';

import { DriverFrame } from './DriverFrame';

/**
 * `/driver` — "Who's driving?" Picks a driver and remembers the choice
 * (`activeDriverId`) so the phone lands on the same driver next time.
 */
export function DriverPicker() {
  const hydrated = useHasHydrated();
  const depot = useAppStore((s) => s.depot);
  const drivers = useAppStore((s) => s.drivers);
  const stops = useAppStore((s) => s.stops);
  const routes = useAppStore((s) => s.routes);
  const activeDriverId = useAppStore((s) => s.activeDriverId);
  const loadSeed = useAppStore((s) => s.loadSeed);
  const setActiveDriver = useAppStore((s) => s.setActiveDriver);

  useEffect(() => {
    if (hydrated) void loadSeed();
  }, [hydrated, loadSeed]);

  const stopsById = useMemo(() => {
    const byId: Record<string, Stop> = {};
    for (const s of stops) byId[s.id] = s;
    return byId;
  }, [stops]);

  const ready = hydrated && !!depot;

  return (
    <DriverFrame>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white pt-safe">
        <div className="flex min-h-14 items-center gap-2 px-3">
          <Link
            href="/"
            aria-label="RouteIQ home"
            className="flex min-h-[44px] items-center gap-2 rounded-lg pr-2 pl-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            <Logo size={28} />
            <span className="text-sm font-semibold text-slate-900">Driver app</span>
          </Link>
          <div className="flex-1" />
          <Link
            href="/dispatch"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            <LayoutDashboard className="size-4" aria-hidden="true" />
            Dispatcher
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col px-4 pt-6 pb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Who&apos;s driving?</h1>
        <p className="mt-1 text-sm text-slate-600">
          Pick your name to open today&apos;s route. Your choice is remembered on this phone.
        </p>

        {ready ? (
          drivers.length === 0 ? (
            <p className="mt-8 text-center text-sm text-slate-600">No drivers in today&apos;s roster.</p>
          ) : (
            <ul className="mt-5 flex flex-col gap-3" aria-label="Drivers">
              {drivers.map((d) => (
                <li key={d.id}>
                  <DriverPickCard
                    driver={d}
                    route={routes?.find((r) => r.driverId === d.id)}
                    routesReady={routes !== null}
                    stopsById={stopsById}
                    lastUsed={activeDriverId === d.id}
                    onPick={() => setActiveDriver(d.id)}
                  />
                </li>
              ))}
            </ul>
          )
        ) : (
          <div className="mt-5 flex flex-col gap-3" role="status" aria-busy="true" aria-label="Loading drivers">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[72px] rounded-xl" />
            ))}
          </div>
        )}

        {ready && routes === null && (
          <p className="mt-6 text-center text-xs text-slate-500">
            Routes have not been optimized yet — the dispatcher runs the optimizer, or you can start a demo
            optimization from your route screen.
          </p>
        )}
      </main>
    </DriverFrame>
  );
}

interface DriverPickCardProps {
  driver: Driver;
  route: Route | undefined;
  routesReady: boolean;
  stopsById: Record<string, Stop>;
  lastUsed: boolean;
  onPick: () => void;
}

function DriverPickCard({ driver, route, routesReady, stopsById, lastUsed, onPick }: DriverPickCardProps) {
  const progress = driverProgress(route, stopsById);
  const n = route?.stopIds.length ?? 0;
  const facts = !routesReady
    ? 'No route yet'
    : n === 0
      ? 'No stops assigned'
      : `${n} ${n === 1 ? 'stop' : 'stops'} · ${formatDuration(route?.totalMinutes ?? 0)}`;
  const initials = driver.name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Link
      href={`/driver/${driver.id}`}
      onClick={onPick}
      aria-label={`${driver.name}, ${driver.vehicle}, ${facts}${lastUsed ? ', last used' : ''}`}
      className={cn(
        'group flex min-h-[72px] w-full items-center gap-3 rounded-xl border bg-white px-4 py-3 text-left shadow-sm transition-all',
        'hover:border-slate-300 hover:shadow-md active:translate-y-px active:shadow-sm',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-100',
        lastUsed ? 'border-slate-300' : 'border-slate-200',
      )}
      style={lastUsed ? { boxShadow: `inset 0 0 0 2px ${driver.color}` } : undefined}
    >
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm"
        style={{ backgroundColor: driver.color }}
      >
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-base font-semibold text-slate-900">{driver.name}</span>
          {lastUsed && (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 text-white"
              style={{ backgroundColor: driver.color }}
            >
              Last used
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-sm text-slate-600 tabular-nums">
          {driver.vehicle} · {facts}
        </span>
        {routesReady && progress.total > 0 && progress.done > 0 && (
          <span className="mt-0.5 block text-xs font-medium text-emerald-700 tabular-nums">
            {progress.done} of {progress.total} done
            {progress.failed > 0 && <span className="text-red-600"> · {progress.failed} failed</span>}
          </span>
        )}
      </span>
      <ChevronRight
        className="size-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}
