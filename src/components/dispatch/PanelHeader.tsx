'use client';

import { Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatTodayLong } from '@/lib/time';
import { useAppStore } from '@/store/useAppStore';

export interface PanelHeaderProps {
  className?: string;
}

/** "9:41 AM" from an ISO timestamp (local time). */
function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Top of the dispatcher panel: today's date, stop/package totals, the
 * "Optimized 9:41 AM · nn-2opt-v1" line, and the primary Optimize button.
 * On mobile this whole block is the bottom sheet's always-visible peek/drag
 * area, so it keeps a fixed number of lines (the status line is always
 * rendered) and stays compact.
 */
export function PanelHeader({ className }: PanelHeaderProps) {
  const stops = useAppStore((s) => s.stops);
  const routes = useAppStore((s) => s.routes);
  const isOptimizing = useAppStore((s) => s.isOptimizing);
  const optimizeError = useAppStore((s) => s.optimizeError);
  const algorithm = useAppStore((s) => s.algorithm);
  const lastOptimizedAt = useAppStore((s) => s.lastOptimizedAt);
  const optimize = useAppStore((s) => s.optimize);

  // Evaluated once on the client (this component only mounts after hydration).
  const [today] = useState(() => formatTodayLong());

  const totals = useMemo(
    () => ({
      stops: stops.length,
      packages: stops.reduce((sum, s) => sum + s.packages, 0),
    }),
    [stops],
  );

  const hasRoutes = routes !== null;
  const optimizedLine =
    hasRoutes && lastOptimizedAt
      ? `Optimized ${formatClock(lastOptimizedAt)}${algorithm ? ` · ${algorithm}` : ''}`
      : 'Not yet optimized';

  return (
    <div className={cn('text-slate-900', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="truncate text-sm font-semibold">
          <span className="sr-only">Dispatch · </span>
          {today}
        </h1>
        <p className="shrink-0 text-xs text-slate-500 tabular-nums">
          {totals.stops} {totals.stops === 1 ? 'stop' : 'stops'} · {totals.packages}{' '}
          {totals.packages === 1 ? 'pkg' : 'pkgs'}
        </p>
      </div>
      <p
        className={cn('mt-0.5 h-4 truncate text-[11px]', hasRoutes ? 'text-emerald-700' : 'text-slate-500')}
        aria-live="polite"
      >
        {optimizedLine}
      </p>

      <Button
        size="lg"
        fullWidth
        className="mt-2"
        loading={isOptimizing}
        onClick={() => void optimize()}
        icon={<Wand2 className="size-4" aria-hidden="true" />}
        // The header doubles as the sheet's drag surface; mark the button so a
        // press on it never starts a drag (BottomSheet also skips buttons).
        data-no-drag
      >
        {isOptimizing ? 'Optimizing…' : hasRoutes ? 'Re-optimize routes' : 'Optimize routes'}
      </Button>

      {optimizeError && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {optimizeError}
        </p>
      )}
    </div>
  );
}
