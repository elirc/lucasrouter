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
 *
 * Rendered as a real <table> (4 columns: metric / baseline / optimized / change)
 * so it degrades gracefully at 375px and reads correctly to screen readers.
 */
export function MetricsCompare({ baseline, optimized, className }: MetricsCompareProps) {
  const hasBaseline = baseline !== null;
  const headline =
    hasBaseline ? describeDelta(baseline.totalDistanceKm, optimized.totalDistanceKm, 'percent') : null;

  return (
    <section
      aria-label="Before and after comparison"
      className={cn('rounded-xl border border-slate-200 bg-white p-4 shadow-sm', className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Before / After</p>
          {headline && (
            <p className="mt-1 text-sm text-slate-600">
              {headline.tone === 'better'
                ? 'Less driving than the as-listed plan'
                : headline.tone === 'worse'
                  ? 'More driving than the as-listed plan'
                  : 'Same distance as the as-listed plan'}
            </p>
          )}
        </div>
        {headline && (
          // aria-label is not allowed on a plain <span> (role generic), so the
          // context lives in visually-hidden text instead.
          <span
            className={cn(
              'shrink-0 rounded-lg px-2.5 py-1 text-xl font-bold tabular-nums ring-1 ring-inset',
              TONE_CLASSES[headline.tone],
            )}
          >
            <span className="sr-only">Total distance change </span>
            {headline.text}
          </span>
        )}
      </div>

      <table className="mt-3 w-full border-collapse text-sm">
        <thead>
          <tr className="text-xs text-slate-500">
            <th scope="col" className="pb-1.5 text-left font-medium">
              Metric
            </th>
            {hasBaseline && (
              <th scope="col" className="pb-1.5 text-right font-medium">
                Baseline
              </th>
            )}
            <th scope="col" className="pb-1.5 text-right font-semibold text-slate-900">
              Optimized
            </th>
            {hasBaseline && (
              <th scope="col" className="pb-1.5 text-right font-medium">
                <span className="sr-only">Change</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const after = row.value(optimized);
            const before = hasBaseline ? row.value(baseline) : null;
            const delta = before !== null ? describeDelta(before, after, row.delta) : null;
            return (
              <tr key={row.label} className="border-t border-slate-100">
                <th scope="row" className="py-2 pr-2 text-left font-normal leading-tight text-slate-600">
                  {row.label}
                </th>
                {before !== null && (
                  <td className="py-2 pl-2 text-right whitespace-nowrap text-slate-500 tabular-nums">
                    {row.format(before)}
                  </td>
                )}
                <td className="py-2 pl-2 text-right font-semibold whitespace-nowrap text-slate-900 tabular-nums">
                  {row.format(after)}
                </td>
                {delta && (
                  <td className="py-2 pl-2 text-right">
                    <span
                      className={cn(
                        'inline-block min-w-[3.25rem] rounded-full px-2 py-0.5 text-center text-xs font-semibold ring-1 ring-inset tabular-nums',
                        TONE_CLASSES[delta.tone],
                      )}
                    >
                      {delta.text}
                      <span className="sr-only">
                        {delta.tone === 'better' ? ' improved' : delta.tone === 'worse' ? ' worse' : ' no change'}
                      </span>
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {!hasBaseline && (
        <p className="mt-3 text-xs text-slate-500">Run the optimizer to see the baseline comparison.</p>
      )}
    </section>
  );
}
