import { Flag, Zap } from 'lucide-react';

import { cn } from '@/lib/cn';
import type { Priority } from '@/lib/types';

export interface PriorityBadgeProps {
  priority: Priority;
  size?: 'sm' | 'md';
  className?: string;
}

const LABEL: Record<Priority, string> = {
  standard: 'Standard',
  priority: 'Priority',
  overnight: 'Overnight',
};

const TONE: Record<Priority, string> = {
  standard: 'bg-slate-100 text-slate-700 ring-slate-200',
  priority: 'bg-amber-50 text-amber-800 ring-amber-200',
  overnight: 'bg-violet-50 text-violet-800 ring-violet-200',
};

/** Pill describing a stop's service level. Server-safe (no hooks). */
export function PriorityBadge({ priority, size = 'sm', className }: PriorityBadgeProps) {
  const Icon = priority === 'priority' ? Flag : priority === 'overnight' ? Zap : null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap ring-1 ring-inset',
        size === 'sm' ? 'px-2 py-0.5 text-[11px] leading-4' : 'px-2.5 py-1 text-xs leading-4',
        TONE[priority],
        className,
      )}
    >
      {Icon && <Icon className={size === 'sm' ? 'size-3' : 'size-3.5'} aria-hidden="true" />}
      {LABEL[priority]}
    </span>
  );
}
