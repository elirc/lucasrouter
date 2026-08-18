'use client';

import { Layers, X } from 'lucide-react';
import { useState } from 'react';

import { RouteLegend } from '@/components/map';
import { cn } from '@/lib/cn';
import type { Driver, Route } from '@/lib/types';

export interface LegendOverlayProps {
  drivers: Driver[];
  routes: Route[];
  hiddenDriverIds: string[];
  onToggle: (driverId: string) => void;
  unassignedCount: number;
  className?: string;
}

/**
 * The route legend floated over the map's top-left corner. Always visible on
 * desktop; on phones it collapses behind a small "Legend" chip so it does not
 * crowd a 375px-wide map. Rendered as a *sibling* of the map wrapper (which is
 * `relative z-0 isolate`), so `z-10` reliably sits above Leaflet's panes.
 *
 * Phones put the OSM attribution flush in the map's top-right corner (a 14px
 * strip, y 0–14); the chip starts at 16px so even a wide "Legend · 2 hidden"
 * chip never overlaps it, and the opened legend hangs below the chip.
 */
export function LegendOverlay({
  drivers,
  routes,
  hiddenDriverIds,
  onToggle,
  unassignedCount,
  className,
}: LegendOverlayProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const hiddenCount = hiddenDriverIds.length;

  return (
    <div
      className={cn(
        'pointer-events-none absolute top-4 left-3 z-10 flex flex-col items-start gap-2 md:top-3',
        className,
      )}
    >
      {/* Mobile chip (hidden on md+ where the legend is always shown). */}
      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        aria-expanded={mobileOpen}
        aria-controls="dispatch-legend"
        className={cn(
          'pointer-events-auto flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3.5 text-sm font-medium text-slate-800 shadow-sm backdrop-blur-sm md:hidden',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900',
        )}
      >
        {mobileOpen ? <X className="size-4" aria-hidden="true" /> : <Layers className="size-4" aria-hidden="true" />}
        {mobileOpen ? 'Hide legend' : 'Legend'}
        {!mobileOpen && hiddenCount > 0 && (
          <span className="rounded-full bg-slate-900 px-1.5 text-[11px] leading-4 text-white tabular-nums">
            {hiddenCount} hidden
          </span>
        )}
      </button>

      <div id="dispatch-legend" className={cn('pointer-events-auto', mobileOpen ? 'block' : 'hidden md:block')}>
        <RouteLegend
          drivers={drivers}
          routes={routes}
          hiddenDriverIds={hiddenDriverIds}
          onToggle={onToggle}
          unassignedCount={unassignedCount}
        />
      </div>
    </div>
  );
}
