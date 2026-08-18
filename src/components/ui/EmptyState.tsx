import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  /** Icon element (defaults to an inbox). Pass a lucide icon with `className="size-6"`. */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Usually a <Button>. */
  action?: ReactNode;
  className?: string;
}

/** Centered "nothing here yet" panel. Server-safe. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center',
        className,
      )}
    >
      <div
        className="mb-3 flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-500"
        aria-hidden="true"
      >
        {icon ?? <Inbox className="size-6" />}
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
