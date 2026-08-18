import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export type CardProps = HTMLAttributes<HTMLDivElement>;

/** White surface: rounded-xl, subtle border + shadow, p-4. Server-safe. */
export function Card({ className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn('rounded-xl border border-slate-200 bg-white p-4 shadow-sm', className)}
      {...rest}
    >
      {children}
    </div>
  );
}
