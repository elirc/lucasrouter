'use client';

import { ChevronDown } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { formatDuration, to12h } from '@/lib/time';
import type { Driver, Route, Stop } from '@/lib/types';

export interface DriverCardProps {
  driver: Driver;
  route: Route | undefined;
  stopsById: Record<string, Stop>;
  expanded: boolean;
  onToggle: () => void;
  /** Rendered when expanded (the page passes stop rows / dnd lists). */
  children?: ReactNode;
  /** Extra controls rendered beside the toggle button (menus, checkboxes). */
  rightSlot?: ReactNode;
  className?: string;
}

/** Summary line for a route: "N stops · P pkgs · X.X km · 1h 12m · last ETA 9:41 AM". */
export function summarizeRoute(route: Route | undefined, stopsById: Record<string, Stop>): string {
  if (!route) return '—';
  const n = route.stopIds.length;
  if (n === 0) return 'No stops assigned';
  const pkgs = route.stopIds.reduce((sum, id) => sum + (stopsById[id]?.packages ?? 0), 0);
  const lastId = route.stopIds[n - 1];
  const lastEta = route.etaByStopId[lastId];
  const parts = [
    `${n} ${n === 1 ? 'stop' : 'stops'}`,
    `${pkgs} ${pkgs === 1 ? 'pkg' : 'pkgs'}`,
    `${route.totalDistanceKm.toFixed(1)} km`,
    formatDuration(route.totalMinutes),
  ];
  if (lastEta) parts.push(`last ETA ${to12h(lastEta)}`);
  return parts.join(' · ');
}

/**
 * Collapsible per-driver card. The header is a real <button aria-expanded>;
 * `rightSlot` sits beside it (never inside) so the markup stays valid.
 */
export function DriverCard({
  driver,
  route,
  stopsById,
  expanded,
  onToggle,
  children,
  rightSlot,
  className,
}: DriverCardProps) {
  const panelId = useId();
  const total = route?.stopIds.length ?? 0;
  const delivered = route ? route.stopIds.filter((id) => stopsById[id]?.status === 'delivered').length : 0;
  const failed = route ? route.stopIds.filter((id) => stopsById[id]?.status === 'failed').length : 0;

  return (
    <div
      className={cn('overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm', className)}
      style={{ borderLeftColor: driver.color, borderLeftWidth: 4 }}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900"
        >
          <span
            aria-hidden="true"
            className="size-3.5 shrink-0 rounded-full ring-2 ring-white shadow"
            style={{ backgroundColor: driver.color }}
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className="truncate text-sm font-semibold text-slate-900">{driver.name}</span>
              <span className="shrink-0 text-xs text-slate-500">{driver.vehicle}</span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-slate-600 tabular-nums">
              {summarizeRoute(route, stopsById)}
            </span>
            {delivered + failed > 0 && (
              <span className="mt-0.5 block text-[11px] font-medium text-emerald-700 tabular-nums">
                {delivered}/{total} delivered
                {failed > 0 && <span className="text-red-600"> · {failed} failed</span>}
              </span>
            )}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-5 shrink-0 text-slate-400 transition-transform duration-200',
              expanded && 'rotate-180',
            )}
          />
        </button>
        {rightSlot && <div className="flex shrink-0 items-center pr-2">{rightSlot}</div>}
      </div>

      <div id={panelId} hidden={!expanded} className="border-t border-slate-100">
        {expanded && children}
      </div>
    </div>
  );
}
