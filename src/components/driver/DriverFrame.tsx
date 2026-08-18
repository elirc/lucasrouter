import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface DriverFrameProps {
  children: ReactNode;
  className?: string;
}

/**
 * Phone-shaped page column shared by every /driver screen: full-height flex
 * column (min-h-dvh, never 100vh) that becomes a centered 480px "phone" with a
 * subtle side border on desktop. Server-safe.
 */
export function DriverFrame({ children, className }: DriverFrameProps) {
  return (
    <div
      className={cn(
        'mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-slate-100',
        'md:border-x md:border-slate-200 md:shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}
