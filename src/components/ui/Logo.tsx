import { cn } from '@/lib/cn';

export interface LogoProps {
  className?: string;
  /** Render the "RouteIQ" wordmark next to the mark. */
  withWordmark?: boolean;
  /** Mark size in px (wordmark scales with text size). Default 32. */
  size?: number;
}

/**
 * RouteIQ mark: a slate-900 rounded square with a white route polyline
 * threading three waypoint dots. The same geometry (scaled ×8) lives in
 * `public/icons/icon.svg` and the generated PNG icons.
 */
export function LogoMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="RouteIQ"
      className={cn('shrink-0', className)}
    >
      <rect x="0" y="0" width="64" height="64" rx="14" fill="#0f172a" />
      <path
        d="M14 46 Q 24 18, 33 33 T 50 18"
        fill="none"
        stroke="#ffffff"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="14" cy="46" r="5" fill="#ffffff" />
      <circle cx="33" cy="33" r="5" fill="#ffffff" />
      <circle cx="50" cy="18" r="5" fill="#ffffff" />
    </svg>
  );
}

/** Mark + optional wordmark, inline-flex. Server-safe. */
export function Logo({ className, withWordmark = false, size = 32 }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      {withWordmark && (
        <span className="text-lg font-semibold tracking-tight text-slate-900">RouteIQ</span>
      )}
    </span>
  );
}
