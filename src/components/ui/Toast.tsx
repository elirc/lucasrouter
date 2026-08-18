'use client';

import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';
import { useAppStore, type ToastState, type ToastTone } from '@/store/useAppStore';

const AUTO_DISMISS_MS = 3500;
const EXIT_MS = 200;

// All three tones keep white text at >= 4.5:1 (AA): emerald-700 5.4:1,
// red-600 4.8:1, slate-900 14:1. (emerald-600 was 3.7:1 - too light.)
const TONE_CLASSES: Record<ToastTone, string> = {
  success: 'bg-emerald-700 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-slate-900 text-white',
};

const TONE_ICON: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export interface ToastProps {
  /**
   * Extra pixels the toast floats above the bottom safe-area inset. Screens
   * with a bottom-anchored bar (driver route screen, dispatch sheet) pass the
   * bar's height so the toast never covers the primary action. Default 0.
   */
  bottomOffset?: number;
}

/**
 * Store-driven toast. Rendered once per screen (NOT in the root layout, so the
 * static landing page does not pull the store into its bundle). Reads `toast`
 * from the store, auto-dismisses after 3.5 s (timer resets whenever a new
 * toast id arrives), and animates in (keyframe, replayed per toast id via
 * `key`) and out (transition while the previous toast lingers for EXIT_MS).
 */
export function Toast({ bottomOffset = 0 }: ToastProps) {
  const toast = useAppStore((s) => s.toast);
  const dismissToast = useAppStore((s) => s.dismissToast);

  // `shown` lags `toast` by EXIT_MS on dismiss so the exit transition can play.
  // Adjusting state during render (not in an effect) is the React-sanctioned
  // way to derive it from the incoming store value.
  const [shown, setShown] = useState<ToastState | null>(toast);
  const [prevToast, setPrevToast] = useState<ToastState | null>(toast);
  if (toast !== prevToast) {
    setPrevToast(toast);
    if (toast) setShown(toast);
  }

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => dismissToast(), AUTO_DISMISS_MS);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setShown(null), EXIT_MS);
    return () => clearTimeout(timer);
  }, [toast, dismissToast]);

  const exiting = toast === null && shown !== null;
  const tone: ToastTone = shown?.tone ?? 'info';
  const Icon = TONE_ICON[tone];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
      // Safe-area inset + the caller's bar height; the inner card adds mb-4.
      style={{ bottom: `calc(${Math.max(0, bottomOffset)}px + env(safe-area-inset-bottom, 0px))` }}
    >
      {shown && (
        <div
          key={shown.id}
          className={cn(
            'pointer-events-auto mb-4 flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg',
            'animate-toast-in transition-all duration-200 ease-out',
            TONE_CLASSES[tone],
            exiting ? 'translate-y-3 opacity-0' : 'translate-y-0 opacity-100',
          )}
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{shown.message}</span>
          <button
            type="button"
            onClick={dismissToast}
            aria-label="Dismiss notification"
            // white/90 keeps the X >= 4:1 on every tone (3:1 is the UI minimum).
            className="-my-2 -mr-3 flex size-11 shrink-0 items-center justify-center rounded-lg text-white/90 hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
