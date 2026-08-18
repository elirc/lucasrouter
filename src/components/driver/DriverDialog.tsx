'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface DriverDialogProps {
  open: boolean;
  onClose: () => void;
  /** Visible heading; also labels the dialog for assistive tech. */
  title: string;
  /** Optional one-line subtitle under the heading. */
  description?: string;
  children: ReactNode;
  className?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Lightweight modal used by the driver app (fail-reason picker, stop details).
 *
 * - `fixed inset-0 z-50` with a dimmed backdrop; renders as a bottom sheet
 *   that is capped to the 480px phone column so it lines up with the page.
 * - `role="dialog" aria-modal` labelled by the heading.
 * - Escape and backdrop click close it.
 * - On open, focus moves to the first `[data-autofocus]` element (or the
 *   first focusable control); Tab is trapped inside; on close, focus returns
 *   to whatever was focused before.
 * - Body scroll is locked while open.
 *
 * The panel is unmounted when `open` is false so all of the above is simply
 * mount/unmount work.
 */
export function DriverDialog(props: DriverDialogProps) {
  if (!props.open) return null;
  return <DialogPanel {...props} />;
}

function DialogPanel({ onClose, title, description, children, className }: DriverDialogProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep the latest onClose in a ref so the document listener never goes stale.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Focus management + Escape + scroll lock (mount/unmount).
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const target =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector<HTMLElement>(FOCUSABLE) ??
      panel;
    // Defer one frame so the slide-in animation has started and layout is final.
    const raf = requestAnimationFrame(() => target?.focus({ preventScroll: true }));

    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused && previouslyFocused.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  // Minimal Tab trap: wrap focus at either end of the panel.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (nodes.length === 0) {
      e.preventDefault();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="driver-backdrop-in absolute inset-0 bg-slate-900/45"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          'driver-sheet-in relative flex max-h-[88dvh] w-full max-w-[480px] flex-col rounded-t-2xl bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.18)] pb-safe',
          'focus:outline-none',
          className,
        )}
      >
        <div className="flex items-start gap-3 px-4 pt-4 pb-2">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold leading-tight text-slate-900">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-sm text-slate-600">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}
