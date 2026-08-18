import { cn } from '@/lib/cn';
import { pctDelta } from '@/lib/geo';
import { formatDuration } from '@/lib/time';
import type { RouteMetrics } from '@/lib/types';

export interface MetricsCompareProps {
  /** "Before" (naive round-robin). May be null → optimized column only. */
  baseline: RouteMetrics | null;
  optimized: RouteMetrics;
  className?: string;
}

type DeltaKind = 'percent' | 'absolute';

interface RowDef {
  label: string;
  value: (m: RouteMetrics) => number;
  format: (v: number) => string;
  delta: DeltaKind;
}

const ROWS: RowDef[] = [
  {
    label: 'Total distance',
    value: (m) => m.totalDistanceKm,
    format: (v) => `${v.toFixed(1)} km`,
    delta: 'percent',
  },
  {
    label: 'Total time',
    value: (m) => m.totalMinutes,
    format: (v) => formatDuration(v),
    delta: 'percent',
  },
  {
    label: 'Longest route',
    value: (m) => m.longestRouteMinutes,
    format: (v) => formatDuration(v),
    delta: 'percent',
  },
  {
    label: 'Time-window violations',
    value: (m) => m.timeWindowViolations,
    format: (v) => String(Math.round(v)),
    delta: 'absolute',
  },
];

/**
 * Delta chip text + tone. Lower is better for every metric here.
 * percent: "−38%" / "+12%" / "±0"; absolute: "−2" / "+1" / "±0".
 */
export function describeDelta(
  before: number,
  after: number,
  kind: DeltaKind,
): { text: string; tone: 'better' | 'worse' | 'same' } {
  if (kind === 'absolute') {
    const diff = Math.round(after - before);
    if (diff === 0) return { text: '±0', tone: 'same' };
    return diff < 0 ? { text: `−${Math.abs(diff)}`, tone: 'better' } : { text: `+${diff}`, tone: 'worse' };
  }
  const pct = pctDelta(before, after);
  if (pct === null) {
    // Baseline was 0: any positive value is "worse", zero is equal.
    if (after === 0) return { text: '±0', tone: 'same' };
    return { text: 'new', tone: 'worse' };
  }
  const rounded = Math.round(pct);
  if (rounded === 0) return { text: '±0', tone: 'same' };
  return rounded < 0
    ? { text: `−${Math.abs(rounded)}%`, tone: 'better' }
    : { text: `+${rounded}%`, tone: 'worse' };
}

const TONE_CLASSES = {
  better: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  worse: 'bg-red-50 text-red-700 ring-red-200',
  same: 'bg-slate-100 text-slate-600 ring-slate-200',
} as const;

/**
 * The "sales moment" card: Baseline vs Optimized with delta chips. Optimized
 * column is emphasized, baseline muted. Server-safe (pure formatting).
 */
export function MetricsCompare({ baseline, optimized, className }: MetricsCompareProps) {
  const hasBaseline = baseline !== null;
  return (
    <section
      aria-label="Before and after comparison"
      className={cn('rounded-xl border border-slate-200 bg-white p-4 shadow-sm', className)}
    >
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Before / After</p>

      <div
        className={cn(
          'mt-3 grid items-center gap-x-3 gap-y-2 text-sm',
          hasBaseline
            ? 'grid-cols-[minmax(0,1.4fr)_auto_auto_auto]'
            : 'grid-cols-[minmax(0,1fr)_auto]',
        )}
        role="table"
      >
        {/* header row */}
        <div role="row" className="contents">
          <span role="columnheader" className="sr-only">
            Metric
          </span>
          {hasBaseline && (
            <span role="columnheader" className="text-right text-xs font-medium text-slate-500">
              Baseline
            </span>
          )}
          <span role="columnheader" className="text-right text-xs font-semibold text-slate-900">
            Optimized
          </span>
          {hasBaseline && (
            <span role="columnheader" className="sr-only">
              Change
            </span>
          )}
        </div>

        {ROWS.map((row) => {
          const after = row.value(optimized);
          const before = hasBaseline ? row.value(baseline) : null;
          const delta = before !== null ? describeDelta(before, after, row.delta) : null;
          return (
            <div role="row" className="contents" key={row.label}>
              <span role="rowheader" className="truncate text-slate-600">
                {row.label}
              </span>
              {before !== null && (
                <span role="cell" className="text-right text-slate-500 tabular-nums">
                  {row.format(before)}
                </span>
              )}
              <span role="cell" className="text-right font-semibold text-slate-900 tabular-nums">
                {row.format(after)}
              </span>
              {delta && (
                <span role="cell" className="text-right">
                  <span
                    className={cn(
                      'inline-block min-w-[3.25rem] rounded-full px-2 py-0.5 text-center text-xs font-semibold ring-1 ring-inset tabular-nums',
                      TONE_CLASSES[delta.tone],
                    )}
                    aria-label={
                      delta.tone === 'better'
                        ? `Improved ${delta.text}`
                        : delta.tone === 'worse'
                          ? `Worse ${delta.text}`
                          : 'No change'
                    }
                  >
                    {delta.text}
                  </span>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {!hasBaseline && (
        <p className="mt-3 text-xs text-slate-500">Run the optimizer to see the baseline comparison.</p>
      )}
    </section>
  );
}
