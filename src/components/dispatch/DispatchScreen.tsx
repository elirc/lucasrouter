'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import { MapView, type FitPadding, type MapViewportInset } from '@/components/map';
import { BottomSheet, Toast, type SheetSnap } from '@/components/ui';
import { useSafeAreaInsetBottom } from '@/components/ui/BottomSheet';
import { shortAddress } from '@/lib/geo';
import { useAppStore, useHasHydrated } from '@/store/useAppStore';

import { DispatchPanel } from './DispatchPanel';
import { DispatchSkeleton } from './DispatchSkeleton';
import { DispatchTopBar } from './DispatchTopBar';
import { LegendOverlay } from './LegendOverlay';
import { PanelHeader } from './PanelHeader';
import { useIsDesktop } from './useIsDesktop';
import { useViewportHeight } from './useViewportHeight';

/**
 * Memoised map: DispatchScreen re-renders on panel-ish store changes
 * (isOptimizing, metrics…) but the map's props stay referentially stable, so
 * Leaflet only re-renders when data it actually shows has changed.
 */
const MemoMapView = memo(MapView);

/** Fit padding: room for the legend on desktop, for the peeking sheet on phones. */
const DESKTOP_FIT_PADDING: [number, number] = [48, 48];
/**
 * BottomSheet chrome above/below the `header` slot: grab handle row (44px)
 * plus the header wrapper's pb-3 (12px). Added to the measured header height
 * to get a peek that shows exactly the header + Optimize button. (The sheet
 * itself adds `env(safe-area-inset-bottom)` on top of this.)
 */
const SHEET_HEADER_CHROME_PX = 56;
const FALLBACK_PEEK_HEIGHT = 156;

/**
 * Phones: keep every marker above the peeking bottom sheet (which is `fixed`
 * over the map). Uses the static peek estimate rather than the measured header
 * height so the map is fitted exactly once on load (a second fit would request
 * a fresh set of tiles at another zoom level and delay first paint).
 */
const MOBILE_FIT_PADDING: FitPadding = {
  topLeft: [16, 16],
  bottomRight: [16, FALLBACK_PEEK_HEIGHT + 16],
};

const NO_INSET: MapViewportInset = { bottom: 0 };

/**
 * The dispatcher (`/dispatch`): full-bleed Leaflet map with the planning panel
 * in a draggable bottom sheet on phones and a fixed right-hand side panel on
 * md+ screens. Reads/writes the shared zustand store; all data work happens
 * in the store/optimizer — this component is layout + wiring.
 */
export function DispatchScreen() {
  const hydrated = useHasHydrated();
  const isDesktop = useIsDesktop();

  // Narrow selectors — the map re-renders only when one of these changes.
  const depot = useAppStore((s) => s.depot);
  const stops = useAppStore((s) => s.stops);
  const drivers = useAppStore((s) => s.drivers);
  const routes = useAppStore((s) => s.routes);
  const hiddenDriverIds = useAppStore((s) => s.hiddenDriverIds);
  const selectedStopId = useAppStore((s) => s.selectedStopId);
  const lastOptimizedAt = useAppStore((s) => s.lastOptimizedAt);
  const loadSeed = useAppStore((s) => s.loadSeed);
  const setSelectedStop = useAppStore((s) => s.setSelectedStop);
  const toggleDriverVisibility = useAppStore((s) => s.toggleDriverVisibility);

  // Load the seed once the persisted state has been read (no-op if present).
  useEffect(() => {
    if (!hydrated) return;
    if (!useAppStore.getState().depot) void loadSeed();
  }, [hydrated, loadSeed]);

  // ---- mobile sheet -----------------------------------------------------------------
  const [snap, setSnap] = useState<SheetSnap>('peek');
  const [headerHeight, setHeaderHeight] = useState(0);
  const viewportHeight = useViewportHeight();
  const safeBottom = useSafeAreaInsetBottom();

  // Measure the sheet header (date/stats/Optimize) so the peek snap shows it
  // exactly, even if the text wraps on very narrow phones. React 19 callback
  // ref with cleanup — re-attached whenever the header mounts/unmounts.
  // Measurement comes from ResizeObserver entries (delivered after layout) rather
  // than a synchronous `offsetHeight` read, which would force a full-page reflow
  // in the middle of the commit that mounts the map (~75 ms on a phone).
  const headerRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') {
      const frame = requestAnimationFrame(() => setHeaderHeight(el.offsetHeight));
      return () => cancelAnimationFrame(frame);
    }
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      const h = box ? box.blockSize : entries[0]?.contentRect.height;
      if (h && h > 0) setHeaderHeight((prev) => (Math.abs(prev - h) < 1 ? prev : h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const peekHeight = headerHeight > 0 ? headerHeight + SHEET_HEADER_CHROME_PX : FALLBACK_PEEK_HEIGHT;

  /**
   * Pixels of the map (measured from its bottom edge) hidden under the sheet,
   * so marker popups can pan into the uncovered part. 'peek' = header strip +
   * safe-area inset; 'half' = 50% of the viewport. 'full' covers the map
   * entirely — but a stop activated from the list snaps the sheet to 'half' in
   * the same render, so it is treated like 'half' here. Object identity is
   * stable while the number is, keeping the memoised map from re-rendering.
   */
  const coveredBottom = isDesktop
    ? 0
    : snap === 'peek'
      ? peekHeight + safeBottom
      : Math.round(viewportHeight * 0.5);
  const viewportInset = useMemo<MapViewportInset>(
    () => (coveredBottom > 0 ? { bottom: coveredBottom } : NO_INSET),
    [coveredBottom],
  );

  // ---- callbacks (stable → map + panel don't re-render needlessly) ---------------------
  /** Row click in the panel: select on the map; on phones shrink the sheet so the popup shows. */
  const handleActivateStop = useCallback(
    (stopId: string) => {
      setSelectedStop(stopId);
      if (!isDesktop) setSnap('half');
    },
    [isDesktop, setSelectedStop],
  );

  /**
   * "Reassign to…" from the map popup. Reads the store imperatively to stay
   * stable. `moveStop` reports whether anything actually changed (it can be a
   * no-op for an unknown stop/driver), so the success toast only fires on a
   * real move — never a "Moved …" for a select that snapped back.
   */
  const handleReassign = useCallback((stopId: string, toDriverId: string) => {
    const state = useAppStore.getState();
    const stop = state.stops.find((s) => s.id === stopId);
    const driver = state.drivers.find((d) => d.id === toDriverId);
    if (!stop || !driver) return;
    const moved = state.moveStop(stopId, toDriverId);
    if (moved) state.showToast(`Moved ${shortAddress(stop.address)} → ${driver.name}`, 'success');
  }, []);

  // ---- derived ----------------------------------------------------------------------------
  const unassignedCount = useMemo(() => {
    if (!routes) return 0;
    let assigned = 0;
    for (const r of routes) assigned += r.stopIds.length;
    return Math.max(0, stops.length - assigned);
  }, [routes, stops.length]);

  // Re-fit when the plan changes or the layout switches between phone/desktop.
  const fitKey = `${routes ? (lastOptimizedAt ?? 'optimized') : 'seed'}:${isDesktop ? 'desktop' : 'mobile'}`;
  const mobilePadding = isDesktop ? DESKTOP_FIT_PADDING : MOBILE_FIT_PADDING;

  // ---- gates ---------------------------------------------------------------------------------
  if (!hydrated || !depot) return <DispatchSkeleton />;

  return (
    <div className="flex h-dvh flex-col bg-slate-100">
      <DispatchTopBar />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Map (+ legend overlay as a sibling above the isolated map wrapper) —
            the page's primary content, hence the <main> landmark. */}
        <main aria-label="Route map" className="relative min-h-0 flex-1">
          <MemoMapView
            depot={depot}
            stops={stops}
            drivers={drivers}
            routes={routes}
            hiddenDriverIds={hiddenDriverIds}
            selectedStopId={selectedStopId}
            onSelectStop={setSelectedStop}
            onReassign={handleReassign}
            fitKey={fitKey}
            fitPadding={mobilePadding}
            viewportInset={viewportInset}
            // The peeking sheet covers the bottom edge on phones: keep the OSM
            // attribution readable by placing it at the top-right (above the
            // zoom control, clear of the legend at the top-left).
            attributionPosition={isDesktop ? 'bottomright' : 'topright'}
            className="h-full w-full"
          />
          {routes && (
            <LegendOverlay
              drivers={drivers}
              routes={routes}
              hiddenDriverIds={hiddenDriverIds}
              onToggle={toggleDriverVisibility}
              unassignedCount={unassignedCount}
            />
          )}
        </main>

        {isDesktop ? (
          <aside
            aria-label="Dispatch panel"
            // Proportional width so the map keeps ~60% across the md range
            // (340px floor at 768px, 460px cap from ~1150px). Mirrors DispatchSkeleton.
            className="flex w-[clamp(340px,40vw,460px)] shrink-0 flex-col border-l border-slate-200 bg-slate-100"
          >
            <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
              <PanelHeader />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <DispatchPanel isDesktop onActivateStop={handleActivateStop} />
            </div>
          </aside>
        ) : (
          <BottomSheet
            snap={snap}
            onSnapChange={setSnap}
            peekHeight={peekHeight}
            label="Dispatch panel"
            header={
              <div ref={headerRef}>
                <PanelHeader />
              </div>
            }
          >
            <div className="px-4 pb-4">
              <DispatchPanel isDesktop={false} onActivateStop={handleActivateStop} />
            </div>
          </BottomSheet>
        )}
      </div>

      {/* Store-driven toast. On phones it floats just above the sheet's peek
          strip (Toast adds the safe-area inset itself) so it never covers the
          bottom-anchored Optimize button; on desktop it sits at the bottom. */}
      <Toast bottomOffset={isDesktop ? 0 : peekHeight} />
    </div>
  );
}
