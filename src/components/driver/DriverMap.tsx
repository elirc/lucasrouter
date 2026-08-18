'use client';

import { Eye, EyeOff, Map as MapIcon } from 'lucide-react';
import { useState } from 'react';

import { MapView } from '@/components/map';
import { cn } from '@/lib/cn';
import type { Depot, Driver, Route, Stop } from '@/lib/types';

export interface DriverMapProps {
  depot: Depot;
  stops: Stop[];
  drivers: Driver[];
  routes: Route[] | null;
  /** Leg to spotlight (see MapViewProps.focus). */
  focus: { driverId: string; fromId: string; toId: string } | null;
  /** Short text shown next to the collapse toggle, e.g. "Depot → 909 Williamson St". */
  legLabel?: string;
  className?: string;
}

/**
 * The driver-mode map: ~35% of the viewport, wrapped in a card, with a
 * "Hide map / Show map" toggle overlaid top-left. The map is unmounted while
 * hidden (Leaflet dislikes `display:none`), which also saves battery on the
 * road; the toggle state lives in component state for the session.
 */
export function DriverMap({ depot, stops, drivers, routes, focus, legLabel, className }: DriverMapProps) {
  const [visible, setVisible] = useState(true);

  const toggle = (
    // The visible label already states the action ("Hide map" / "Show map"), so
    // no aria-pressed: a swapping verb + pressed state read as contradictory.
    <button
      type="button"
      onClick={() => setVisible((v) => !v)}
      className={cn(
        'inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white/95 px-3 text-sm font-medium text-slate-700 shadow-sm backdrop-blur',
        'hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900',
      )}
    >
      {visible ? (
        <EyeOff className="size-4" aria-hidden="true" />
      ) : (
        <Eye className="size-4" aria-hidden="true" />
      )}
      {visible ? 'Hide map' : 'Show map'}
    </button>
  );

  if (!visible) {
    return (
      <div
        className={cn(
          'flex min-h-[56px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm',
          className,
        )}
      >
        <MapIcon className="size-5 shrink-0 text-slate-400" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-sm text-slate-600">
          {legLabel ? `Map hidden · ${legLabel}` : 'Map hidden'}
        </p>
        {toggle}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative h-[35dvh] min-h-[220px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm',
        className,
      )}
    >
      <MapView
        depot={depot}
        stops={stops}
        drivers={drivers}
        routes={routes}
        focus={focus}
        className="h-full w-full"
      />
      {/* Overlay controls sit above the map's own isolated stacking context. */}
      <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex items-start justify-between gap-2">
        <div className="pointer-events-auto">{toggle}</div>
      </div>
    </div>
  );
}
