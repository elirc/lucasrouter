import { Navigation } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { googleMapsDirectionsUrl } from '@/lib/geo';

export interface NavigateLinkProps {
  lat: number;
  lng: number;
  /** Visible label. Default "Navigate". */
  children?: ReactNode;
  /** Accessible name override (e.g. "Navigate to 909 Williamson St"). */
  ariaLabel?: string;
  /** Visual size: md = 44px, lg = 48px. */
  size?: 'md' | 'lg';
  fullWidth?: boolean;
  className?: string;
}

/**
 * External Google Maps directions link styled like the secondary <Button>.
 * It is a real <a target="_blank"> (no key needed) so the OS can hand off to
 * the native maps app on phones. Server-safe.
 */
export function NavigateLink({
  lat,
  lng,
  children = 'Navigate',
  ariaLabel,
  size = 'md',
  fullWidth = false,
  className,
}: NavigateLinkProps) {
  return (
    <a
      href={googleMapsDirectionsUrl(lat, lng)}
      target="_blank"
      rel="noreferrer"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-300 bg-white font-medium text-slate-900 transition-colors',
        'hover:bg-slate-50 active:bg-slate-100',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-100',
        size === 'lg' ? 'min-h-[48px] px-5 text-base' : 'min-h-[44px] px-4 text-sm',
        fullWidth && 'w-full',
        className,
      )}
    >
      <Navigation className="size-4 shrink-0" aria-hidden="true" />
      {children}
    </a>
  );
}
