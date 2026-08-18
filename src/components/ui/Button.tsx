'use client';

import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  fullWidth?: boolean;
  /** Optional leading icon (rendered before children). */
  icon?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950 disabled:bg-slate-400 focus-visible:ring-slate-900',
  secondary:
    'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 active:bg-slate-100 disabled:text-slate-400 disabled:bg-slate-50 focus-visible:ring-slate-900',
  ghost:
    'bg-transparent text-slate-700 hover:bg-slate-200/70 active:bg-slate-200 disabled:text-slate-400 focus-visible:ring-slate-900',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-300 focus-visible:ring-red-600',
};

// md/lg keep a ≥44px hit area (mobile-first tap target).
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-9 min-h-[36px] px-3 text-sm gap-1.5 rounded-lg',
  md: 'min-h-[44px] px-4 text-sm gap-2 rounded-xl',
  lg: 'min-h-[48px] px-5 text-base gap-2 rounded-xl',
};

/**
 * Standard button. Merges arbitrary button attributes; `loading` renders a
 * spinner and disables interaction while keeping the label for layout
 * stability.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    icon,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-100',
        'disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        icon && (
          <span className="inline-flex shrink-0 items-center" aria-hidden="true">
            {icon}
          </span>
        )
      )}
      {children}
    </button>
  );
});
