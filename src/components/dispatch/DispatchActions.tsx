'use client';

import { ArrowRight, Download, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useAppStore } from '@/store/useAppStore';

export interface DispatchActionsProps {
  className?: string;
}

/** Local YYYY-MM-DD for the export filename. */
function todayStamp(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Trigger a browser download of `text` as `filename` via a temporary <a download>. */
function downloadText(filename: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

  const onConfirmReset = async () => {
    setConfirming(false);
    setResetting(true);
    try {
      await resetDemo();
    } finally {
      setResetting(false);
      // Return focus to the (re-rendered) Reset button.
      resetRef.current?.focus();
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
            <Button
              ref={yesRef}
              size="sm"
              variant="danger"
              onClick={() => void onConfirmReset()}
              aria-label="Yes, reset the demo"
            >
              Yes
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} aria-label="No, keep my data">
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
