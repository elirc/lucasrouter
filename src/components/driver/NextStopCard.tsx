'use client';

import { Check, Clock, MapPin, Package, X } from 'lucide-react';
import type { Ref } from 'react';

import { Button, Card, PriorityBadge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatWindow, parseHHMM, to12h } from '@/lib/time';
import type { Driver, Stop } from '@/lib/types';

import { NavigateLink } from './NavigateLink';
import { splitFailureNotes } from './notes';

export interface NextStopCardProps {
  stop: Stop;
  driver: Driver;
  /** 1-based position of this stop in the route. */
  position: number;
  total: number;
  /** Planned arrival "HH:MM" (from route.etaByStopId). */
  eta?: string;
  onDelivered: () => void;
  onFailed: () => void;
  /**
   * Ref to the address heading (`tabIndex={-1}`) so the parent can move
   * keyboard focus onto the new card after Delivered/Failed re-mounts it.
   */
  headingRef?: Ref<HTMLHeadingElement>;
  className?: string;
}

/** True when the planned arrival is after the end of the stop's time window. */
export function isEtaLate(eta: string | undefined, window: Stop['timeWindow']): boolean {
  if (!eta || !window) return false;
  try {
    return parseHHMM(eta) > parseHHMM(window.end);
  } catch {
    return false;
  }
}

/**
 * The dominant card of the driver screen: everything a driver needs about the
 * stop in front of them plus the two big outcome buttons and a Navigate link.
 * Parents `key` this on `stop.id` so it re-mounts (and fades in) as the route
 * advances.
 */
export function NextStopCard({
  stop,
  driver,
  position,
  total,
  eta,
  onDelivered,
  onFailed,
  headingRef,
  className,
}: NextStopCardProps) {
  const late = isEtaLate(eta, stop.timeWindow);
  // A stale "<reason> · " prefix (failed → undone) is not a delivery note.
  const { note } = splitFailureNotes(stop.notes);
  return (
    <Card
      className={cn('driver-fade-in overflow-hidden p-4', className)}
      style={{ borderLeftColor: driver.color, borderLeftWidth: 4 }}
      aria-labelledby={`next-stop-${stop.id}`}
      role="region"
    >
      {/* Eyebrow */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase tabular-nums">
          Next stop · #{position} of {total}
        </p>
        <PriorityBadge priority={stop.priority} />
      </div>

      {/* Address + recipient */}
      <h2
        id={`next-stop-${stop.id}`}
        ref={headingRef}
        tabIndex={-1}
        className="mt-1.5 rounded-sm text-xl font-semibold leading-tight text-slate-900 text-balance focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
      >
        {stop.address}
      </h2>
      <p className="mt-1 text-sm text-slate-600">{stop.recipient}</p>

      {/* Facts */}
      <dl className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Packages</dt>
          <Package className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
          <dd className="tabular-nums">
            {stop.packages} {stop.packages === 1 ? 'pkg' : 'pkgs'}
          </dd>
        </div>
        {stop.timeWindow && (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Time window</dt>
            <Clock className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
            <dd className="tabular-nums">{formatWindow(stop.timeWindow)}</dd>
          </div>
        )}
        {eta && (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Estimated arrival</dt>
            <MapPin className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
            <dd className={cn('tabular-nums', late ? 'font-medium text-amber-700' : undefined)}>
              ETA {to12h(eta)}
              {late && <span className="ml-1 text-xs font-medium">· after window</span>}
            </dd>
          </div>
        )}
      </dl>

      {note && <p className="mt-2 line-clamp-3 text-sm text-slate-600">{note}</p>}

      {/* Actions */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button
          size="lg"
          variant="primary"
          className="h-[52px]"
          icon={<Check className="size-5" strokeWidth={2.5} />}
          onClick={onDelivered}
          aria-label={`Mark ${stop.address} delivered`}
        >
          Delivered
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="h-[52px]"
          // Danger-outline look; inline colours win over the variant's slate ones.
          style={{ borderColor: '#fca5a5', color: '#b91c1c' }}
          icon={<X className="size-5" strokeWidth={2.5} />}
          onClick={onFailed}
          aria-label={`Mark ${stop.address} failed`}
        >
          Failed
        </Button>
      </div>
      <NavigateLink
        lat={stop.lat}
        lng={stop.lng}
        fullWidth
        className="mt-3"
        ariaLabel={`Navigate to ${stop.address} (opens Google Maps)`}
      >
        Navigate
      </NavigateLink>
    </Card>
  );
}
