'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import { MapView } from '@/components/map';
import { BottomSheet, type SheetSnap } from '@/components/ui';
import { shortAddress } from '@/lib/geo';
import { useAppStore, useHasHydrated } from '@/store/useAppStore';

import { DispatchPanel } from './DispatchPanel';
import { DispatchSkeleton } from './DispatchSkeleton';
import { DispatchTopBar } from './DispatchTopBar';
import { LegendOverlay } from './LegendOverlay';
import { PanelHeader } from './PanelHeader';
import { useIsDesktop } from './useIsDesktop';

/**
 * Memoised map: DispatchScreen re-renders on panel-ish store changes
 * (isOptimizing, metrics…) but the map's props stay referentially stable, so
 * Leaflet only re-renders when data it actually shows has changed.
 */
const MemoMapView = memo(MapView);

/** Fit padding: room for the legend on desktop, for the peeking sheet on phones. */
const DESKTOP_FIT_PADDING: [number, number] = [48, 48];
const MOBILE_FIT_PADDING: [number, number] = [24, 120];

/**
 * BottomSheet chrome above/below the `header` slot: grab handle area
 * (pt-2 + h-8 + pb-1 = 44px) plus the header wrapper's pb-3 (12px). Added to
 * the measured header height to get a peek that shows exactly the header +
 * Optimize button.
 */
const SHEET_HEADER_CHROME_PX = 56;
const FALLBACK_PEEK_HEIGHT = 156;

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

  // Measure the sheet header (date/stats/Optimize) so the peek snap shows it
  // exactly, even if the text wraps on very narrow phones. React 19 callback
  // ref with cleanup — re-attached whenever the header mounts/unmounts.
  const headerRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const measure = () => setHeaderHeight(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const peekHeight = headerHeight > 0 ? headerHeight + SHEET_HEADER_CHROME_PX : FALLBACK_PEEK_HEIGHT;

  // ---- callbacks (stable → map + panel don't re-render needlessly) ---------------------
  /** Row click in the panel: select on the map; on phones shrink the sheet so the popup shows. */
  const handleActivateStop = useCallback(
    (stopId: string) => {
      setSelectedStop(stopId);
      if (!isDesktop) setSnap('half');
    },
    [isDesktop, setSelectedStop],
  );

  /** "Reassign to…" from the map popup. Reads the store imperatively to stay stable. */
  const handleReassign = useCallback((stopId: string, toDriverId: string) => {
    const state = useAppStore.getState();
    const stop = state.stops.find((s) => s.id === stopId);
    const driver = state.drivers.find((d) => d.id === toDriverId);
    if (!stop || !driver) return;
    state.moveStop(stopId, toDriverId);
    state.showToast(`Moved ${shortAddress(stop.address)} → ${driver.name}`, 'success');
  }, []);

  // ---- derived ----------------------------------------------------------------------------
  const unassignedCount = useMemo(() => {
    if (!routes) return 0;
    let assigned = 0;
    for (const r of routes) assigned += r.stopIds.length;
    return Math.max(0, stops.length - assigned);
  }, [routes, stops.length]);

  const fitKey = routes ? (lastOptimizedAt ?? 'optimized') : 'seed';

  // ---- gates ---------------------------------------------------------------------------------
  if (!hydrated || !depot) return <DispatchSkeleton />;

  return (
    <div className="flex h-dvh flex-col bg-slate-100">
      <DispatchTopBar />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Map (+ legend overlay as a sibling above the isolated map wrapper) */}
        <div className="relative min-h-0 flex-1">
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
            fitPadding={isDesktop ? DESKTOP_FIT_PADDING : MOBILE_FIT_PADDING}
            // The peeking sheet covers the bottom edge on phones: keep the OSM
            // attribution readable by stacking it under the zoom control.
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
        </div>

        {isDesktop ? (
          <aside
            aria-label="Dispatch panel"
            className="flex w-[420px] shrink-0 flex-col border-l border-slate-200 bg-slate-100 xl:w-[460px]"
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
    </div>
  );
}
