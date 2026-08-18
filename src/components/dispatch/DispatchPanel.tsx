'use client';

import { MetricsCompare } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useAppStore } from '@/store/useAppStore';

import { DispatchActions } from './DispatchActions';
import { DriverRoutes } from './DriverRoutes';
import { UnassignedSection } from './UnassignedSection';

export interface DispatchPanelProps {
  isDesktop: boolean;
  /** A stop row was clicked (select it on the map; mobile also shrinks the sheet). */
  onActivateStop: (stopId: string) => void;
  className?: string;
}

/**
 * Scrollable body of the dispatcher panel (everything below the header /
 * Optimize button): before-vs-after metrics, per-driver route cards, the
 * unassigned section and the secondary actions. Shared by the desktop side
 * panel and the mobile bottom sheet.
 */
export function DispatchPanel({ isDesktop, onActivateStop, className }: DispatchPanelProps) {
  const baselineMetrics = useAppStore((s) => s.baselineMetrics);
  const optimizedMetrics = useAppStore((s) => s.optimizedMetrics);

  return (
    <div className={cn('space-y-4 text-sm', className)}>
      {optimizedMetrics && <MetricsCompare baseline={baselineMetrics} optimized={optimizedMetrics} />}

      <section aria-label="Driver routes">
        <DriverRoutes isDesktop={isDesktop} onActivateStop={onActivateStop} />
      </section>

      <UnassignedSection onActivateStop={onActivateStop} />

      <DispatchActions className="border-t border-slate-200 pt-4" />
    </div>
  );
}
