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
  /**
   * Heading level of `title`. Default 2 — the empty state usually sits right
   * under the page's h1 (driver screens). Pass 3 only when an h2 already
   * precedes it, so the outline never skips a level.
   */
  headingLevel?: 2 | 3;
  className?: string;
}

/** Centered "nothing here yet" panel. Server-safe. */
export function EmptyState({ icon, title, description, action, headingLevel = 2, className }: EmptyStateProps) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
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
      <Heading className="text-base font-semibold text-slate-900">{title}</Heading>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
