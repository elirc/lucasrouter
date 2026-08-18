import { cn } from '@/lib/cn';

export interface SkeletonProps {
  className?: string;
}

/** Pulsing placeholder block. Give it a size via className (e.g. `h-4 w-32`). */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded bg-slate-200', className)} />;
}
