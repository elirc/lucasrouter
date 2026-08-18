'use client';

import { PackageX } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { StopRow } from '@/components/ui';
import { UNASSIGNED_COLOR } from '@/components/map';
import { cn } from '@/lib/cn';
import { shortAddress } from '@/lib/geo';
import type { Stop } from '@/lib/types';
import { useAppStore } from '@/store/useAppStore';

import { MoveStopMenu } from './MoveStopMenu';

export interface UnassignedSectionProps {
  onActivateStop: (stopId: string) => void;
  className?: string;
}

/**
 * Stops that are not on any route.
 *  - Before optimizing: a quiet "45 stops · not yet routed" note.
 *  - After optimizing: a card listing the leftovers (rare — only when the
 *    optimizer could not fit a stop) with an "Assign to…" ⋯ menu per row.
 *  - Nothing when every stop is routed.
 */
export function UnassignedSection({ onActivateStop, className }: UnassignedSectionProps) {
  const stops = useAppStore((s) => s.stops);
  const drivers = useAppStore((s) => s.drivers);
  const routes = useAppStore((s) => s.routes);
  const selectedStopId = useAppStore((s) => s.selectedStopId);
  const isOptimizing = useAppStore((s) => s.isOptimizing);
  const moveStop = useAppStore((s) => s.moveStop);
  const showToast = useAppStore((s) => s.showToast);

  const unassigned = useMemo<Stop[]>(() => {
    if (!routes) return [];
    const assigned = new Set<string>();
    for (const r of routes) for (const id of r.stopIds) assigned.add(id);
    return stops.filter((s) => !assigned.has(s.id));
  }, [routes, stops]);

  const handleAssign = useCallback(
    (stop: Stop, toDriverId: string) => {
      const driver = drivers.find((d) => d.id === toDriverId);
      if (!driver) return;
      // Toast only when the store reports a real move.
      const moved = moveStop(stop.id, toDriverId);
      if (moved) showToast(`Moved ${shortAddress(stop.address)} → ${driver.name}`, 'success');
    },
    [drivers, moveStop, showToast],
  );

  if (!routes) {
    return (
      <p className={cn('px-1 text-center text-xs text-slate-500 tabular-nums', className)} aria-live="polite">
        {stops.length} {stops.length === 1 ? 'stop' : 'stops'} · not yet routed
      </p>
    );
  }

  if (unassigned.length === 0) return null;

  return (
    <section
      aria-labelledby="unassigned-heading"
      className={cn('overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm', className)}
      style={{ borderLeftColor: UNASSIGNED_COLOR, borderLeftWidth: 4 }}
    >
      <div className="flex min-h-[56px] items-center gap-3 px-3 py-3">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"
        >
          <PackageX className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="unassigned-heading" className="text-sm font-semibold text-slate-900">
            Unassigned
          </h2>
          <p className="text-xs text-slate-600 tabular-nums">
            {unassigned.length} {unassigned.length === 1 ? 'stop needs' : 'stops need'} a driver
          </p>
        </div>
      </div>
      <ul className="divide-y divide-slate-100 border-t border-slate-100" aria-label="Unassigned stops">
        {unassigned.map((stop, i) => {
          const selected = selectedStopId === stop.id;
          return (
            <li
              key={stop.id}
              className="border-l-[3px]"
              style={{ borderLeftColor: selected ? UNASSIGNED_COLOR : 'transparent' }}
              data-selected={selected || undefined}
            >
              <StopRow
                index={i + 1}
                stop={stop}
                color={UNASSIGNED_COLOR}
                onClick={() => onActivateStop(stop.id)}
                style={selected ? { backgroundColor: '#f8fafc' } : undefined}
                rightSlot={
                  <MoveStopMenu
                    stop={stop}
                    drivers={drivers}
                    currentDriverId={null}
                    disabled={isOptimizing}
                    onMove={(toDriverId) => handleAssign(stop, toDriverId)}
                  />
                }
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
