import { Check, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import type { StopStatus } from '@/lib/types';

export interface StatusPillProps {
  status: StopStatus;
  className?: string;
}

const LABEL: Record<StopStatus, string> = {
  pending: 'Pending',
  delivered: 'Delivered',
  failed: 'Failed',
};

const TONE: Record<StopStatus, string> = {
  pending: 'bg-slate-100 text-slate-700 ring-slate-200',
  delivered: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  failed: 'bg-red-50 text-red-800 ring-red-200',
};

/** Pill describing a stop's delivery status. Server-safe (no hooks). */
export function StatusPill({ status, className }: StatusPillProps) {
  const Icon = status === 'delivered' ? Check : status === 'failed' ? X : null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap ring-1 ring-inset',
        TONE[status],
        className,
      )}
    >
      {Icon && <Icon className="size-3" strokeWidth={3} aria-hidden="true" />}
      {LABEL[status]}
    </span>
  );
}
