'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/cn';

export type SheetSnap = 'peek' | 'half' | 'full';

export interface BottomSheetProps {
  /** When false the sheet slides fully off-screen (default true). */
  open?: boolean;
  /** Controlled snap point. */
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  /**
   * Visible height (px) of handle + header in the 'peek' snap, EXCLUDING the
   * bottom safe-area inset — the sheet adds `env(safe-area-inset-bottom)`
   * itself so the header never sits under the iOS home indicator. Default 132.
   */
  peekHeight?: number;
  /** Always-visible header rendered above the scroll area; also a drag surface. */
  header?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Accessible name for the dialog. Default "Details". */
  label?: string;
}

const SNAPS: SheetSnap[] = ['peek', 'half', 'full'];
/** Gap kept above the sheet in the 'full' snap (matches `calc(100dvh - 64px)`). */
const FULL_TOP_GAP = 64;
/** Pointer must move this far before a drag starts (keeps taps on header buttons working). */
const DRAG_THRESHOLD_PX = 6;
/** How far ahead (ms) to project the release velocity when choosing a snap. */
const VELOCITY_PROJECT_MS = 160;
/** Snap transition (transform + the peek-only safe-area padding animate together). */
const SNAP_TRANSITION = '200ms cubic-bezier(0.32, 0.72, 0, 1)';

interface DragState {
  pointerId: number;
  startY: number;
  startHeight: number;
  captured: boolean;
  /** Recent samples for velocity estimation. */
  samples: { y: number; t: number }[];
}

/**
 * Reads `env(safe-area-inset-bottom)` in pixels (0 on non-notched devices and
 * during SSR). CSS handles the inset declaratively wherever it can; this hook
 * exists for the places that need the same number in JS: the sheet's drag /
 * snap math and the parent's "how much of the map is covered" arithmetic.
 * Re-measured on resize (rotation changes the inset).
 */
export function useSafeAreaInsetBottom(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const measure = () => {
      const probe = document.createElement('div');
      probe.style.cssText =
        'position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
        'padding-bottom:env(safe-area-inset-bottom, 0px)';
      document.body.appendChild(probe);
      const px = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
      probe.remove();
      setInset((prev) => (Math.abs(prev - px) < 0.5 ? prev : px));
    };
    // First reading inside a frame so it shares the frame's layout instead of
    // forcing one right after the mount commit.
    const frame = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, []);
  return inset;
}

/**
 * Mobile bottom sheet with three snap points. The sheet is `100dvh - 64px`
 * tall and positioned with `translateY`, so snapping is a pure transform
 * (200 ms transition, disabled while dragging). At rest the transform is a CSS
 * `calc()` on `dvh` (and `env(safe-area-inset-bottom)` for peek), which makes
 * SSR output correct with no measurement flash; during a drag we use measured
 * pixels. The scroll area receives bottom padding equal to the hidden portion
 * so the last item can always be scrolled into the visible region.
 *
 * Safe area: in 'peek' the header is the bottom-most visible chrome, so the
 * header wrapper gains `env(safe-area-inset-bottom)` of padding and the peek
 * offset grows by the same amount — the primary action in the header stays
 * clear of the home indicator. At 'half'/'full' the padding animates away
 * (the scroll body carries the inset instead).
 */
export function BottomSheet({
  open = true,
  snap,
  onSnapChange,
  peekHeight = 132,
  header,
  children,
  className,
  label = 'Details',
}: BottomSheetProps) {
  const [viewportH, setViewportH] = useState<number>(0);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const safeBottom = useSafeAreaInsetBottom();
  const dragRef = useRef<DragState | null>(null);
  // Set right after a real drag so a synthetic click on the handle button
  // (some browsers still fire it after pointer capture) does not also cycle.
  const suppressClickRef = useRef(false);

  // Track the visual viewport height (≈ 100dvh) for drag math + resize.
  useEffect(() => {
    const measure = () => setViewportH(window.innerHeight);
    // `innerHeight` forces layout; take the first reading inside a frame
    // callback so it shares the frame's own layout instead of forcing an
    // extra one right after the (heavy) mount commit.
    const frame = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, []);

  const fullHeight = Math.max(0, viewportH - FULL_TOP_GAP);
  // Pixel heights used by the drag/snap math; must agree with `restingOffset`
  // below (peek = header chrome + safe-area inset).
  const snapHeights = useCallback(
    (): Record<SheetSnap, number> => ({
      peek: Math.min(peekHeight + safeBottom, fullHeight || peekHeight + safeBottom),
      half: Math.min(viewportH * 0.5, fullHeight || viewportH * 0.5),
      full: fullHeight,
    }),
    [peekHeight, safeBottom, fullHeight, viewportH],
  );

  // ---- drag handling -------------------------------------------------------

  const isInteractive = (target: EventTarget | null) =>
    target instanceof Element &&
    target.closest('button, a, input, select, textarea, [role="button"], [data-no-drag]') !==
      null;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!open || viewportH === 0) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Let buttons/links inside the header behave normally (the grab handle
    // itself is a button, but it is explicitly a drag surface).
    const onHandle = e.target instanceof Element && e.target.closest('[data-handle]') !== null;
    if (!onHandle && isInteractive(e.target)) return;
    const heights = snapHeights();
    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startHeight: heights[snap],
      captured: false,
      samples: [{ y: e.clientY, t: e.timeStamp }],
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dy = e.clientY - d.startY; // positive = dragging down
    if (!d.captured) {
      if (Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      d.captured = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    d.samples.push({ y: e.clientY, t: e.timeStamp });
    if (d.samples.length > 6) d.samples.shift();
    const heights = snapHeights();
    const next = Math.max(heights.peek, Math.min(heights.full, d.startHeight - dy));
    setDragHeight(next);
  };

  const finishDrag = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (!d.captured) return; // was a tap, not a drag
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    suppressClickRef.current = true;
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    setDragHeight(null);
    if (cancelled) return;

    const heights = snapHeights();
    const current = Math.max(heights.peek, Math.min(heights.full, d.startHeight - (e.clientY - d.startY)));

    // Velocity (px/ms, positive = upward = growing) from the last few samples.
    const first = d.samples[0];
    const last = d.samples[d.samples.length - 1];
    const dt = Math.max(1, last.t - first.t);
    const velocity = (first.y - last.y) / dt;
    const projected = current + velocity * VELOCITY_PROJECT_MS;

    let best: SheetSnap = snap;
    let bestDist = Infinity;
    for (const s of SNAPS) {
      const dist = Math.abs(heights[s] - projected);
      if (dist < bestDist) {
        bestDist = dist;
        best = s;
      }
    }
    if (best !== snap) onSnapChange(best);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => finishDrag(e, false);
  const onPointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => finishDrag(e, true);

  // ---- keyboard handle -------------------------------------------------------

  const cycleSnap = () => {
    if (suppressClickRef.current) return;
    const i = SNAPS.indexOf(snap);
    onSnapChange(SNAPS[(i + 1) % SNAPS.length]);
  };
  const onHandleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = SNAPS.indexOf(snap);
    if (e.key === 'ArrowUp' && i < SNAPS.length - 1) {
      e.preventDefault();
      onSnapChange(SNAPS[i + 1]);
    } else if (e.key === 'ArrowDown' && i > 0) {
      e.preventDefault();
      onSnapChange(SNAPS[i - 1]);
    }
  };

  // ---- geometry ----------------------------------------------------------------

  const dragging = dragHeight !== null;
  const peeking = snap === 'peek';
  // Hidden portion (offset from the bottom) as CSS so SSR/first paint is right.
  // Peek shows `peekHeight` + the safe-area inset (see snapHeights()).
  const restingOffset: string = !open
    ? '100%'
    : snap === 'full'
      ? '0px'
      : snap === 'half'
        ? `calc(50dvh - ${FULL_TOP_GAP}px)`
        : `calc(100dvh - ${FULL_TOP_GAP + peekHeight}px - env(safe-area-inset-bottom, 0px))`;

  const offset = dragging ? `${Math.max(0, fullHeight - (dragHeight ?? 0))}px` : restingOffset;

  const sheetStyle: CSSProperties = {
    height: `calc(100dvh - ${FULL_TOP_GAP}px)`,
    transform: `translateY(${offset})`,
    transition: dragging ? 'none' : `transform ${SNAP_TRANSITION}`,
  };
  // pb-3 (0.75rem) always; plus the safe-area inset while peeking so the header
  // is the last thing above the home indicator. Animates with the snap.
  const headerStyle: CSSProperties = {
    paddingBottom: peeking ? 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' : '0.75rem',
    transition: dragging ? 'none' : `padding-bottom ${SNAP_TRANSITION}`,
  };
  const scrollStyle: CSSProperties = {
    // Let the last items scroll into the visible region (+ home-indicator inset).
    paddingBottom: open ? `calc(${offset} + env(safe-area-inset-bottom, 0px))` : 0,
  };

  return (
    <div
      role="dialog"
      aria-label={label}
      aria-hidden={!open || undefined}
      data-snap={snap}
      style={sheetStyle}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.12)]',
        'will-change-transform',
        !open && 'pointer-events-none',
        className,
      )}
    >
      {/* Drag surface: handle + header. touch-action:none so the browser never pans. */}
      <div
        className="shrink-0 touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {/* 44px row (pt-2 + 32 + pb-1); the button overhangs it by 6px each way
            so its hit area is 44px tall while the visual pill stays centred. */}
        <div className="flex justify-center pt-2 pb-1" data-handle="true">
          <button
            type="button"
            onClick={cycleSnap}
            onKeyDown={onHandleKeyDown}
            aria-label={`Resize panel (currently ${snap}). Use arrow keys or drag.`}
            className="-my-1.5 flex h-11 w-full max-w-[120px] items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            <span aria-hidden="true" className="block h-1.5 w-10 rounded-full bg-slate-300" />
          </button>
        </div>
        {header && (
          <div className="px-4" style={headerStyle}>
            {header}
          </div>
        )}
      </div>

      {/* While peeking the body is translated below the viewport: make it inert
          so Tab / screen-reader swipes cannot land on invisible controls. The
          header (primary action) above stays focusable. */}
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={scrollStyle}
        inert={peeking}
      >
        {children}
      </div>
    </div>
  );
}
