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
 * - Native `<dialog>` opened with `showModal()`: it lives in the top layer,
 *   everything behind it is inert for pointer, keyboard AND assistive tech,
 *   and Escape arrives as a `cancel` event. Rendered as a bottom sheet capped
 *   to the 480px phone column so it lines up with the page.
 * - `aria-modal` + labelled by the heading; backdrop click closes.
 * - On open, focus moves to the first `[data-autofocus]` element, or — when a
 *   sheet deliberately marks nothing (the outcome sheets: a held Enter must not
 *   auto-activate anything) — to the panel itself. Tab wraps inside the panel;
 *   on close the dialog is closed explicitly and focus returns to whatever was
 *   focused before (when it still exists).
 * - The page behind is scroll-locked with the `position: fixed` body
 *   technique (the only one iOS Safari honours; `overflow: hidden` alone lets
 *   the page rubber-band and jump), and the document scrollbar track is kept
 *   so the centred column does not shift on desktop.
 *
 * The panel is unmounted when `open` is false so all of the above is simply
 * mount/unmount work.
 */
export function DriverDialog(props: DriverDialogProps) {
  if (!props.open) return null;
  return <DialogPanel {...props} />;
}

/**
 * Freeze document scrolling while a modal is open and return the undo.
 * Pins the body at the current scroll offset (works on iOS, unlike
 * `overflow: hidden`), keeps a scrollbar track on desktop so nothing
 * re-centres, and restores the scroll position on unlock.
 */
function lockBodyScroll(): () => void {
  const body = document.body;
  const html = document.documentElement;
  const scrollY = window.scrollY;
  const scrollbarGap = window.innerWidth - html.clientWidth;
  const prev = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    htmlOverflowY: html.style.overflowY,
  };

  body.style.position = 'fixed';
  body.style.top = `-${scrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  if (scrollbarGap > 0) html.style.overflowY = 'scroll';

  return () => {
    body.style.position = prev.position;
    body.style.top = prev.top;
    body.style.left = prev.left;
    body.style.right = prev.right;
    body.style.width = prev.width;
    html.style.overflowY = prev.htmlOverflowY;
    window.scrollTo(0, scrollY);
  };
}

function DialogPanel({ onClose, title, description, children, className }: DriverDialogProps) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep the latest onClose in a ref so the native listeners never go stale.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  /**
   * Set while WE close the dialog (in the effect cleanup below), so the
   * resulting `close` event is not reported to the parent as "the user closed
   * the sheet". It has to be a ref rather than a local because `close()` fires
   * its event from a QUEUED TASK, not synchronously: under StrictMode the
   * cleanup and the second setup both run before that task, so the event lands
   * on the *second* run's listener — and the sheet slammed shut the instant it
   * opened. The ref survives that re-run (same component instance).
   */
  const selfClosingRef = useRef(false);

  // Open as a modal + focus management + Escape + scroll lock (mount/unmount).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Top layer + inert background + native focus containment.
    if (!dialog.open) dialog.showModal();

    const panel = panelRef.current;
    // No `[data-autofocus]` means "focus the sheet itself", NOT "focus the
    // first control": the first control is the Close button, so holding Enter
    // on the card's "Delivered" auto-repeated onto Close and dismissed the
    // proof sheet without recording anything. The panel carries tabIndex={-1}
    // for exactly this, and a screen reader reads the dialog from its heading.
    const target = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel;
    // Defer one frame so the slide-in animation has started and layout is final.
    const raf = requestAnimationFrame(() => target?.focus({ preventScroll: true }));

    // Escape → `cancel`. We keep ownership of the open state (the parent
    // unmounts us) instead of letting the dialog close itself; if the browser
    // refuses the preventDefault (Chrome's close-watcher rules) the following
    // `close` event still routes to onClose.
    const onCancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    const onNativeClose = () => {
      if (selfClosingRef.current) {
        selfClosingRef.current = false; // our own cleanup close, not the user's
        return;
      }
      onCloseRef.current();
    };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onNativeClose);

    const unlockScroll = lockBodyScroll();

    return () => {
      cancelAnimationFrame(raf);
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onNativeClose);
      unlockScroll();
      // Close before unmounting. Removing an open modal from the DOM does drop
      // it from the top layer, but leaving it open breaks StrictMode's
      // double-invoked effect: the second run starts while the first dialog is
      // still open and focused, so it captures an element INSIDE the dialog as
      // `previouslyFocused`, and on close focus falls to <body> instead of
      // returning to the button that opened the sheet.
      if (dialog.open) {
        selfClosingRef.current = true;
        try {
          dialog.close();
        } catch {
          // Some browsers throw if the dialog is mid-removal; nothing to do.
          selfClosingRef.current = false;
        }
      }
      // Return focus if the opener still exists (after Delivered/Failed the
      // parent moves focus to the new card instead).
      if (previouslyFocused && previouslyFocused.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  // Tab wrap inside the panel (the native modal already keeps focus out of
  // the page; this just avoids a detour through the browser chrome).
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
    // The <dialog> itself is a transparent full-viewport container (UA sizing,
    // padding, border and background reset); its ::backdrop is transparent
    // because we draw our own animated one below.
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={cn(
        'fixed inset-0 z-50 m-0 h-auto max-h-none w-auto max-w-none overflow-visible border-0 bg-transparent p-0 text-slate-900',
        'focus:outline-none backdrop:bg-transparent',
      )}
    >
      {/* Backdrop: click closes; touch-none stops iOS panning the page from here. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="driver-backdrop-in absolute inset-0 touch-none bg-slate-900/45"
      />
      {/* Layout layer lets clicks through to the backdrop; only the panel catches them. */}
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center">
        {/* Panel */}
        <div
          ref={panelRef}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className={cn(
            'driver-sheet-in pointer-events-auto relative flex max-h-[88dvh] w-full max-w-[480px] flex-col rounded-t-2xl bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.18)] pb-safe',
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
    </dialog>
  );
}
