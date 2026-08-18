'use client';

import { ArrowRight, Download, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
// Shared with the driver's end-of-day report (src/lib/download.ts).
import { downloadText, todayStamp } from '@/lib/download';
import { useAppStore } from '@/store/useAppStore';

export interface DispatchActionsProps {
  className?: string;
}

/** How long the inline "Reset? Yes / No" confirmation stays armed. */
const CONFIRM_TIMEOUT_MS = 6000;

/**
 * Secondary actions at the bottom of the panel: Reset demo (inline confirm —
 * no `window.confirm`), Export routes (JSON download) and a link to the
 * driver app.
 */
export function DispatchActions({ className }: DispatchActionsProps) {
  const routes = useAppStore((s) => s.routes);
  const isOptimizing = useAppStore((s) => s.isOptimizing);
  const resetDemo = useAppStore((s) => s.resetDemo);
  const exportRoutesJson = useAppStore((s) => s.exportRoutesJson);
  const showToast = useAppStore((s) => s.showToast);

  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const yesRef = useRef<HTMLButtonElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);

  // Auto-disarm the confirmation, and move focus into it when it appears.
  useEffect(() => {
    if (!confirming) return;
    yesRef.current?.focus();
    const t = setTimeout(() => setConfirming(false), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [confirming]);

  // Return focus to the Reset button once it is enabled again. Focusing it
  // synchronously after `setResetting(false)` would hit a still-disabled
  // button (the state update is batched) and drop focus to <body>.
  const refocusResetRef = useRef(false);
  useEffect(() => {
    if (resetting || !refocusResetRef.current) return;
    refocusResetRef.current = false;
    resetRef.current?.focus();
  }, [resetting]);

  const onConfirmReset = async () => {
    setConfirming(false);
    setResetting(true);
    try {
      await resetDemo();
    } finally {
      refocusResetRef.current = true;
      setResetting(false);
    }
  };

  const onExport = () => {
    if (!routes) return;
    try {
      downloadText(`routeiq-routes-${todayStamp(new Date())}.json`, exportRoutesJson());
      showToast('Routes exported as JSON', 'success');
    } catch {
      showToast('Export failed', 'error');
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid grid-cols-2 gap-2">
        {confirming ? (
          <div
            role="group"
            aria-label="Confirm reset"
            className="col-span-1 flex min-h-[44px] items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate font-medium text-red-800">Reset?</span>
            {/* Default (md) size keeps the 44px tap target for a destructive
                confirm; px-3! trims the horizontal padding so "Reset? Yes No"
                fits the half-width cell on a 375px phone. */}
            <Button
              ref={yesRef}
              variant="danger"
              className="px-3!"
              onClick={() => void onConfirmReset()}
              aria-label="Yes, reset the demo"
            >
              Yes
            </Button>
            <Button
              variant="ghost"
              className="px-3!"
              onClick={() => setConfirming(false)}
              aria-label="No, keep my data"
            >
              No
            </Button>
          </div>
        ) : (
          <Button
            ref={resetRef}
            variant="secondary"
            onClick={() => setConfirming(true)}
            loading={resetting}
            disabled={isOptimizing}
            icon={<RotateCcw className="size-4" aria-hidden="true" />}
          >
            Reset demo
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={onExport}
          disabled={!routes || isOptimizing}
          icon={<Download className="size-4" aria-hidden="true" />}
          title={routes ? 'Download the current routes as JSON' : 'Optimize first to export routes'}
        >
          Export JSON
        </Button>
      </div>

      <Link
        href="/driver"
        className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-200/70 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
      >
        Open driver app
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
