'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import type { Driver } from '@/lib/types';

export interface DriverHeaderProps {
  driver: Driver;
  /** Stops delivered or failed. */
  done: number;
  total: number;
}

/**
 * Sticky top header of the driver route screen: back link, driver identity,
 * live "7 of 15 stops" counter and a 3px progress bar in the driver's colour.
 */
export function DriverHeader({ driver, done, total }: DriverHeaderProps) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white pt-safe">
      <div className="flex min-h-14 items-center gap-1 pr-4 pl-1">
        <Link
          href="/driver"
          aria-label="Back to drivers"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
        >
          <ChevronLeft className="size-6" aria-hidden="true" />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-full ring-2 ring-white shadow"
            style={{ backgroundColor: driver.color }}
          />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold leading-tight text-slate-900">{driver.name}</h1>
            <p className="truncate text-xs text-slate-500">{driver.vehicle}</p>
          </div>
        </div>
        <p
          className="shrink-0 text-sm font-medium text-slate-700 tabular-nums"
          aria-live="polite"
          aria-atomic="true"
        >
          {done} of {total} {total === 1 ? 'stop' : 'stops'}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="Route progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${total} stops done`}
        className="h-[3px] w-full bg-slate-100"
      >
        <div
          className="h-full transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%`, backgroundColor: driver.color }}
        />
      </div>
    </header>
  );
}

export interface DriverPlainHeaderProps {
  title: string;
  /** Right-aligned slot (e.g. a link). */
  right?: ReactNode;
  /** Where the back chevron goes. Default "/driver". */
  backHref?: string;
  backLabel?: string;
}

/**
 * Simple sticky header used by the empty/error states of the route screen
 * (driver not found, not optimized yet, no stops).
 */
export function DriverPlainHeader({
  title,
  right,
  backHref = '/driver',
  backLabel = 'Back to drivers',
}: DriverPlainHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white pt-safe">
      <div className="flex min-h-14 items-center gap-1 pr-3 pl-1">
        <Link
          href={backHref}
          aria-label={backLabel}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
        >
          <ChevronLeft className="size-6" aria-hidden="true" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-slate-900">{title}</h1>
        {right && <div className="flex shrink-0 items-center">{right}</div>}
      </div>
    </header>
  );
}
