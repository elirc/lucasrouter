import { Skeleton } from '@/components/ui';

import { DispatchTopBar } from './DispatchTopBar';

/** Placeholder rows that mimic the driver cards. */
function PanelSkeletonContent() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-2 h-12 w-full rounded-xl" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-3">
            <Skeleton className="size-3.5 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-52" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Full-screen loading state shown until the persisted store has rehydrated
 * and the seed is in memory: top bar, pulsing map area and a panel skeleton
 * (side panel on md+, sheet-shaped block at the bottom on phones). Pure CSS
 * responsiveness — no JS measurement needed before hydration.
 */
export function DispatchSkeleton() {
  return (
    <div className="flex h-dvh flex-col bg-slate-100" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading dispatcher…</span>
      <DispatchTopBar />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Map placeholder */}
        <div className="relative min-h-0 flex-1 animate-pulse bg-slate-200" aria-hidden="true">
          {/* Mobile sheet placeholder */}
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-slate-200 bg-white px-4 pt-3 pb-safe shadow-[0_-8px_30px_rgba(0,0,0,0.12)] md:hidden">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300" />
            <div className="space-y-2 pb-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-3 w-40" />
              <Skeleton className="mt-2 h-12 w-full rounded-xl" />
            </div>
          </div>
        </div>
        {/* Desktop side panel placeholder */}
        <aside
          className="hidden w-[420px] shrink-0 border-l border-slate-200 bg-slate-100 p-4 md:block xl:w-[460px]"
          aria-hidden="true"
        >
          <PanelSkeletonContent />
        </aside>
      </div>
    </div>
  );
}
