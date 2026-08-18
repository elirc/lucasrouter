import { Home, Truck } from 'lucide-react';
import Link from 'next/link';

import { Logo } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface DispatchTopBarProps {
  className?: string;
}

const NAV_LINK =
  'flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900';

/**
 * Compact 48px app bar: logo/wordmark (→ home), "Home" and "Driver app" links.
 * Server-safe (no hooks) — also used inside the loading skeleton.
 */
export function DispatchTopBar({ className }: DispatchTopBarProps) {
  return (
    <header
      className={cn(
        'flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-2 pt-safe md:px-3',
        className,
      )}
    >
      <Link
        href="/"
        aria-label="RouteIQ home"
        className="flex min-h-11 items-center rounded-lg px-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
      >
        <Logo withWordmark size={24} className="[&>span]:text-base" />
        <span className="ml-2 hidden rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-slate-600 uppercase sm:inline">
          Dispatcher
        </span>
      </Link>
      <nav aria-label="Primary" className="flex items-center gap-1">
        <Link href="/" className={NAV_LINK}>
          <Home className="size-4" aria-hidden="true" />
          <span>Home</span>
        </Link>
        <Link href="/driver" className={NAV_LINK}>
          <Truck className="size-4" aria-hidden="true" />
          <span>Driver app</span>
        </Link>
      </nav>
    </header>
  );
}
