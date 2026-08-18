'use client';

// Compact legend card: one checkbox row per driver (colour chip, name, stop
// count) plus an "Unassigned" chip. Pages absolutely-position it over a map
// corner. Pure DOM — does not need to live inside <MapContainer>.

import type { Driver, Route } from '@/lib/types';
import { UNASSIGNED_COLOR } from './colors';

export interface RouteLegendProps {
  drivers: Driver[];
  routes: Route[] | null;
  hiddenDriverIds: string[];
  /** Called with the driver id whose visibility should flip. */
  onToggle: (driverId: string) => void;
  /** Stops not on any route; when > 0 a grey "Unassigned" chip is shown. */
  unassignedCount?: number;
  className?: string;
  /** Optional heading (visually small). Default "Drivers". */
  title?: string;
}

export function RouteLegend({
  drivers,
  routes,
  hiddenDriverIds,
  onToggle,
  unassignedCount = 0,
  className,
  title = 'Drivers',
}: RouteLegendProps) {
  const hidden = new Set(hiddenDriverIds);
  const countFor = (driverId: string): number | null => {
    if (!routes) return null;
    const r = routes.find((x) => x.driverId === driverId);
    return r ? r.stopIds.length : 0;
  };

  return (
    <fieldset
      className={[
        'rounded-xl border border-slate-200 bg-white/95 shadow-sm backdrop-blur-sm',
        'min-w-[11rem] max-w-[16rem] text-sm text-slate-900',
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      <legend className="sr-only">{title}: toggle route visibility</legend>
      <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500" aria-hidden="true">
        {title}
      </div>
      <ul className="py-1">
        {drivers.map((d) => {
          const isHidden = hidden.has(d.id);
          const count = countFor(d.id);
          const inputId = `riq-legend-${d.id}`;
          return (
            <li key={d.id}>
              <label
                htmlFor={inputId}
                className="flex min-h-11 cursor-pointer select-none items-center gap-2.5 px-3 hover:bg-slate-50 focus-within:bg-slate-50"
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={!isHidden}
                  onChange={() => onToggle(d.id)}
                  className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                  style={{ accentColor: d.color }}
                  aria-label={`Show ${d.name}'s route`}
                />
                <span
                  className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
                  style={{
                    backgroundColor: d.color,
                    opacity: isHidden ? 0.35 : 1,
                    boxShadow: '0 0 0 1px rgb(15 23 42 / 0.15)',
                  }}
                  aria-hidden="true"
                />
                {/* Hidden state: strike-through + dimmed chip + unchecked box. The
                    label stays >= 4.5:1 (slate-500) — the checkbox is still
                    enabled (it is how you re-show the driver). */}
                <span className={`min-w-0 flex-1 truncate ${isHidden ? 'text-slate-500 line-through' : ''}`}>
                  {d.name}
                </span>
                {count !== null ? (
                  <span className="shrink-0 tabular-nums text-xs text-slate-500">
                    {count} {count === 1 ? 'stop' : 'stops'}
                  </span>
                ) : null}
              </label>
            </li>
          );
        })}
        {unassignedCount > 0 ? (
          <li className="flex min-h-11 items-center gap-2.5 px-3 text-slate-600" aria-live="polite">
            <span className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span
              className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
              style={{ backgroundColor: UNASSIGNED_COLOR, boxShadow: '0 0 0 1px rgb(15 23 42 / 0.15)' }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">Unassigned</span>
            <span className="shrink-0 tabular-nums text-xs text-slate-500">
              {unassignedCount} {unassignedCount === 1 ? 'stop' : 'stops'}
            </span>
          </li>
        ) : null}
      </ul>
    </fieldset>
  );
}
