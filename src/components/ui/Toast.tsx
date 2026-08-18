'use client';

import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';
import { useAppStore, type ToastState, type ToastTone } from '@/store/useAppStore';

const AUTO_DISMISS_MS = 3500;
const EXIT_MS = 200;

const TONE_CLASSES: Record<ToastTone, string> = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-slate-900 text-white',
};

const TONE_ICON: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

/**
 * Global toast, rendered once in the root layout. Reads `toast` from the store,
 * auto-dismisses after 3.5 s (timer resets whenever a new toast id arrives),
 * and animates in (keyframe, replayed per toast id via `key`) and out
 * (transition while the previous toast lingers for EXIT_MS).
 */
export function Toast() {
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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-safe"
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
            className="-my-2 -mr-3 flex size-11 shrink-0 items-center justify-center rounded-lg text-white/80 hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
