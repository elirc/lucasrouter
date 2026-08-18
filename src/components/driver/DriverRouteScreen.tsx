'use client';

import './driver.css';

import { Inbox, Loader2, RotateCcw, UserX } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { MapSkeleton } from '@/components/map';
import { Button, Card, EmptyState, Skeleton, Toast } from '@/components/ui';
import { downloadText, todayStamp } from '@/lib/download';
import { shortAddress } from '@/lib/geo';
import { to12h } from '@/lib/time';
import type { FailureReason, Stop } from '@/lib/types';
import { driverProgress, useAppStore, useHasHydrated, type DeliveryProofInput } from '@/store/useAppStore';

import { ActivityLogSheet } from './ActivityLogSheet';
import { DeliverySheet } from './DeliverySheet';
import { DriverFrame } from './DriverFrame';
import { DriverHeader, DriverPlainHeader } from './DriverHeader';
import { DriverMap } from './DriverMap';
import { DriverStopList } from './DriverStopList';
import { FailReasonSheet } from './FailReasonSheet';
import { NavigateLink } from './NavigateLink';
import { NextStopCard } from './NextStopCard';
import { buildEventsJson, buildRouteReportCsv, eventsForDriver, summarizeDay } from './report';
import { RouteCompleteCard } from './RouteCompleteCard';
import { StopDetailsSheet } from './StopDetailsSheet';

export interface DriverRouteScreenProps {
  driverId: string;
}

/**
 * Height (px) of the sticky bottom bar (min-h 48/56 + 1px border). The toast
 * floats this far above the safe-area inset so "Return to depot" and the
 * "Next: …" strip are never covered by "Delivered · …" for 3.5 s.
 */
const BOTTOM_BAR_TOAST_OFFSET = 56;

/**
 * The phone experience for one driver (`/driver/[id]`).
 *
 * Everything on screen is derived from the store on every render (route,
 * progress, next stop), so a dispatcher moving stops between drivers, or a
 * status change made in another tab, shows up immediately; delivery progress
 * survives refresh via the store's persistence.
 *
 * A driver never waits for dispatch: when no plan exists yet the screen
 * prepares one itself (one `optimize()` call, "Preparing your route…" while it
 * runs, a retry if it fails) instead of the old "ask dispatch" dead end.
 */
export function DriverRouteScreen({ driverId }: DriverRouteScreenProps) {
  const hydrated = useHasHydrated();

  // Raw slices only (see the store's selector note); derive below with useMemo.
  const depot = useAppStore((s) => s.depot);
  const drivers = useAppStore((s) => s.drivers);
  const stops = useAppStore((s) => s.stops);
  const routes = useAppStore((s) => s.routes);
  const deliveryLog = useAppStore((s) => s.deliveryLog);
  const loadSeed = useAppStore((s) => s.loadSeed);
  const optimize = useAppStore((s) => s.optimize);
  const setActiveDriver = useAppStore((s) => s.setActiveDriver);
  const recordDelivery = useAppStore((s) => s.recordDelivery);
  const recordFailure = useAppStore((s) => s.recordFailure);
  const undoStop = useAppStore((s) => s.undoStop);
  const deferStop = useAppStore((s) => s.deferStop);
  const showToast = useAppStore((s) => s.showToast);

  // Load data once hydrated (no-op when the persisted state already has it).
  useEffect(() => {
    if (hydrated) void loadSeed();
  }, [hydrated, loadSeed]);

  const driver = useMemo(() => drivers.find((d) => d.id === driverId), [drivers, driverId]);

  // Remember this driver as the "last used" one on the picker. Claimed ONCE
  // per screen (when it mounts / the driver id changes) and read imperatively:
  // `activeDriverId` is persisted and cross-tab-synced, so an effect that
  // re-ran on its changes would make two driver tabs (D1 and D2) overwrite
  // each other forever - each "correcting" the value the other just wrote.
  const driverExists = !!driver;
  useEffect(() => {
    if (!hydrated || !driverExists) return;
    if (useAppStore.getState().activeDriverId !== driverId) setActiveDriver(driverId);
  }, [hydrated, driverExists, driverId, setActiveDriver]);

  // ---- auto-prepare a plan --------------------------------------------------
  // Nobody has optimized yet (fresh device, reset demo): rather than telling
  // the driver to go find dispatch, run the optimizer once for them. The
  // "is it running" flag is the store's own `isOptimizing` — no extra state to
  // set synchronously inside the effect (which would cascade renders).
  const isOptimizing = useAppStore((s) => s.isOptimizing);
  // Was there a plan the first time this screen could see one? Captured by
  // adjusting state during render (the React-sanctioned way to derive from an
  // incoming value, as in `Toast`), NOT in an effect. `false` — arrived with
  // nothing — is the only case that auto-optimizes: if a plan existed and
  // later vanished, the dispatcher reset the demo and silently re-optimizing
  // would undo their reset from under them.
  const [planAtFirstLook, setPlanAtFirstLook] = useState<boolean | null>(null);
  if (hydrated && depot && planAtFirstLook === null) setPlanAtFirstLook(routes !== null);

  const attemptedRef = useRef(false);
  const [prepareOutcome, setPrepareOutcome] = useState<'ok' | 'failed' | null>(null);
  const prepare = useCallback(async () => {
    attemptedRef.current = true;
    // `toast: 'driver'`: the dispatcher's "Optimized in 70 ms · nn-2opt-v1" is
    // the point of the demo on /dispatch and meaningless on a phone that just
    // quietly prepared its own route.
    await optimize({ toast: 'driver' });
    // Read the outcome imperatively: `routes` in this closure is stale.
    setPrepareOutcome(useAppStore.getState().routes ? 'ok' : 'failed');
  }, [optimize]);
  useEffect(() => {
    if (routes !== null || planAtFirstLook !== false || !driverExists) return;
    if (attemptedRef.current) return; // one automatic attempt; the UI offers a retry
    void prepare();
  }, [routes, planAtFirstLook, driverExists, prepare]);

  const route = useMemo(() => routes?.find((r) => r.driverId === driverId), [routes, driverId]);
  const stopsById = useMemo(() => {
    const byId: Record<string, Stop> = {};
    for (const s of stops) byId[s.id] = s;
    return byId;
  }, [stops]);
  const progress = useMemo(() => driverProgress(route, stopsById), [route, stopsById]);
  // Today's records for this driver (newest first) + the day's summary numbers.
  const events = useMemo(() => eventsForDriver(deliveryLog, driverId, route), [deliveryLog, driverId, route]);
  const summary = useMemo(() => summarizeDay(events), [events]);

  const { total, done, delivered, failed, nextIndex } = progress;
  const nextStopId = route && nextIndex >= 0 ? route.stopIds[nextIndex] : null;
  const nextStop = nextStopId ? stopsById[nextStopId] : undefined;
  const lastStopId = route && route.stopIds.length > 0 ? route.stopIds[route.stopIds.length - 1] : null;
  const isComplete = total > 0 && nextIndex === -1;

  // Focus leg for the map: previous stop (or depot) → next stop; when the
  // route is complete, last stop → depot.
  const focus = useMemo(() => {
    if (!route || total === 0) return null;
    if (nextIndex >= 0) {
      const fromId = nextIndex === 0 ? 'DEPOT' : route.stopIds[nextIndex - 1];
      return { driverId, fromId, toId: route.stopIds[nextIndex] };
    }
    return { driverId, fromId: lastStopId ?? 'DEPOT', toId: 'DEPOT' };
  }, [route, total, nextIndex, driverId, lastStopId]);

  const legLabel = useMemo(() => {
    if (!focus) return undefined;
    const name = (id: string) => (id === 'DEPOT' ? 'Depot' : shortAddress(stopsById[id]?.address ?? id));
    return `${name(focus.fromId)} → ${name(focus.toId)}`;
  }, [focus, stopsById]);

  // ---- local UI state -------------------------------------------------------
  const [deliverStopId, setDeliverStopId] = useState<string | null>(null);
  const [failStopId, setFailStopId] = useState<string | null>(null);
  const [detailsStopId, setDetailsStopId] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const deliverStop = deliverStopId ? (stopsById[deliverStopId] ?? null) : null;
  const failStop = failStopId ? (stopsById[failStopId] ?? null) : null;
  const detailsStop = detailsStopId ? stopsById[detailsStopId] : undefined;

  // ---- focus management -----------------------------------------------------
  // The Next Stop card is keyed on the stop id, so Delivered/Failed/Skip
  // re-mount it and the button that was just activated leaves the DOM (focus
  // would fall to <body>). When the action came from the card's own buttons we
  // move focus deliberately onto the new card's heading (or the Route complete
  // heading). Actions from the details sheet are left to the dialog, which
  // returns focus to the row that opened it.
  const nextHeadingRef = useRef<HTMLHeadingElement>(null);
  const completeHeadingRef = useRef<HTMLHeadingElement>(null);
  const pendingFocusRef = useRef(false);
  const nextStopKey = nextStop?.id ?? null;
  useEffect(() => {
    if (!pendingFocusRef.current) return;
    pendingFocusRef.current = false;
    const target = isComplete ? completeHeadingRef.current : nextHeadingRef.current;
    target?.focus({ preventScroll: true });
  }, [nextStopKey, isComplete]);

  // ---- actions --------------------------------------------------------------
  /** Undo from a toast: the restored stop becomes "next", so take focus with it. */
  const undoFromToast = useCallback(
    (stopId: string) => {
      pendingFocusRef.current = true;
      if (undoStop(stopId)) showToast('Undone · back to pending', 'info');
    },
    [undoStop, showToast],
  );

  const confirmDelivery = useCallback(
    (proof: DeliveryProofInput) => {
      const stopId = deliverStopId;
      const stop = stopId ? stopsById[stopId] : undefined;
      setDeliverStopId(null);
      if (!stopId || !stop) return;
      const result = recordDelivery(stopId, proof);
      if (!result.ok) return;
      showToast(
        result.photoDropped
          ? `Delivered · ${shortAddress(stop.address)} (photo not saved — the photo budget for this device is full)`
          : `Delivered · ${shortAddress(stop.address)}`,
        result.photoDropped ? 'info' : 'success',
        { label: 'Undo', onAction: () => undoFromToast(stopId) },
      );
    },
    [deliverStopId, stopsById, recordDelivery, showToast, undoFromToast],
  );

  const markFailed = useCallback(
    (stopId: string, reason: FailureReason, note?: string) => {
      setFailStopId(null);
      setDetailsStopId(null);
      if (!stopsById[stopId]) return;
      recordFailure(stopId, reason, note);
      showToast(`Marked failed · ${reason}`, 'info', {
        label: 'Undo',
        onAction: () => undoFromToast(stopId),
      });
    },
    [stopsById, recordFailure, showToast, undoFromToast],
  );

  const markPending = useCallback(
    (stopId: string) => {
      const stop = stopsById[stopId];
      setDetailsStopId(null);
      if (!stop) return;
      if (undoStop(stopId)) showToast(`Marked pending · ${shortAddress(stop.address)}`, 'info');
    },
    [stopsById, undoStop, showToast],
  );

  const skipStop = useCallback(
    (stopId: string) => {
      const stop = stopsById[stopId];
      setDetailsStopId(null);
      if (!stop) return;
      if (deferStop(stopId)) showToast(`Skipped · ${shortAddress(stop.address)} moved to the end`, 'info');
      else showToast('This stop is already last on your route', 'info');
    },
    [stopsById, deferStop, showToast],
  );

  const openDeliverySheet = useCallback((stopId: string) => {
    setDetailsStopId(null);
    setDeliverStopId(stopId);
  }, []);

  const openFailSheet = useCallback((stopId: string) => {
    setDetailsStopId(null);
    setFailStopId(stopId);
  }, []);

  // Card-button variants: flag that the follow-up focus belongs to the card.
  const cardDelivered = useCallback(
    (stopId: string) => {
      pendingFocusRef.current = true;
      openDeliverySheet(stopId);
    },
    [openDeliverySheet],
  );
  const cardFailed = useCallback(
    (stopId: string) => {
      pendingFocusRef.current = true;
      openFailSheet(stopId);
    },
    [openFailSheet],
  );
  const cardSkipped = useCallback(
    (stopId: string) => {
      pendingFocusRef.current = true;
      skipStop(stopId);
    },
    [skipStop],
  );
  const cancelSheet = useCallback(() => {
    // Cancelled from the card path: nothing re-mounts, the dialog restores focus.
    pendingFocusRef.current = false;
    setFailStopId(null);
    setDeliverStopId(null);
  }, []);

  // ---- end-of-day report ----------------------------------------------------
  const downloadReport = useCallback(
    (format: 'csv' | 'json') => {
      if (!route || !driver) return;
      try {
        if (format === 'csv') {
          downloadText(
            `routeiq-report-${driverId}-${todayStamp()}.csv`,
            buildRouteReportCsv({ route, stopsById, events }),
            'text/csv;charset=utf-8',
          );
        } else {
          downloadText(
            `routeiq-events-${driverId}-${todayStamp()}.json`,
            buildEventsJson({ driver, route, events }),
          );
        }
        showToast(format === 'csv' ? 'Report downloaded (CSV)' : 'Events downloaded (JSON)', 'success');
      } catch {
        showToast('Download failed', 'error');
      }
    },
    [route, driver, driverId, stopsById, events, showToast],
  );

  // ---- render states --------------------------------------------------------

  if (!hydrated || !depot) {
    return <RouteScreenSkeleton />;
  }

  if (!driver) {
    return (
      <StateScreen title="Driver">
        <EmptyState
          icon={<UserX className="size-6" aria-hidden="true" />}
          title="Driver not found"
          description={`There is no driver with id "${driverId}" in today's roster.`}
          action={<BackToDriversLink />}
        />
      </StateScreen>
    );
  }

  if (!routes) {
    // No plan: we are building one (the common case — first visit), it failed,
    // or dispatch cleared it while this screen was open (then it is the
    // driver's call, not an automatic re-plan).
    const autoPreparing = isOptimizing || (planAtFirstLook === false && prepareOutcome === null);
    const failed = prepareOutcome === 'failed';
    return (
      <StateScreen title={driver.name} subtitle={driver.vehicle} color={driver.color}>
        {autoPreparing ? (
          <PreparingRoute />
        ) : (
          <EmptyState
            icon={<RotateCcw className="size-6" aria-hidden="true" />}
            title={failed ? 'Could not build your route' : 'Your route was cleared'}
            description={
              failed
                ? "Something went wrong while planning today's stops. Try again — it only takes a moment."
                : 'Dispatch reset the demo. Plan today’s stops again whenever you are ready.'
            }
            action={
              <div className="flex flex-col items-center gap-3">
                <Button
                  size="lg"
                  onClick={() => {
                    setPrepareOutcome(null);
                    void prepare();
                  }}
                >
                  {failed ? 'Try again' : 'Prepare my route'}
                </Button>
                <BackToDriversLink />
              </div>
            }
          />
        )}
      </StateScreen>
    );
  }

  if (!route || total === 0) {
    return (
      <StateScreen title={driver.name} subtitle={driver.vehicle} color={driver.color}>
        <EmptyState
          icon={<Inbox className="size-6" aria-hidden="true" />}
          title="No stops assigned to you today"
          description="Dispatch may still move stops onto your route — this screen updates automatically."
          action={<BackToDriversLink />}
        />
      </StateScreen>
    );
  }

  const nextEta = nextStopId ? route.etaByStopId[nextStopId] : undefined;
  const detailsIndex = detailsStopId ? route.stopIds.indexOf(detailsStopId) : -1;
  // Skipping only makes sense while something else is still pending.
  const canSkip = total - done > 1;

  return (
    <DriverFrame>
      <DriverHeader
        driver={driver}
        done={done}
        total={total}
        logCount={events.length}
        onOpenLog={() => setLogOpen(true)}
      />

      <main className="flex flex-1 flex-col gap-3 px-3 py-3">
        {isComplete ? (
          <RouteCompleteCard
            route={route}
            driver={driver}
            stopsById={stopsById}
            delivered={delivered}
            failed={failed}
            deferred={summary.deferred}
            actualMinutes={summary.actualMinutes}
            onDownloadCsv={() => downloadReport('csv')}
            onDownloadJson={() => downloadReport('json')}
            headingRef={completeHeadingRef}
          />
        ) : nextStop ? (
          <NextStopCard
            key={nextStop.id}
            stop={nextStop}
            driver={driver}
            position={nextIndex + 1}
            total={total}
            eta={nextEta}
            onDelivered={() => cardDelivered(nextStop.id)}
            onFailed={() => cardFailed(nextStop.id)}
            onSkip={canSkip ? () => cardSkipped(nextStop.id) : undefined}
            headingRef={nextHeadingRef}
          />
        ) : null}

        <DriverMap depot={depot} stops={stops} drivers={drivers} routes={routes} focus={focus} legLabel={legLabel} />

        <DriverStopList
          route={route}
          driver={driver}
          stopsById={stopsById}
          nextIndex={nextIndex}
          remaining={total - done}
          onSelectStop={setDetailsStopId}
        />
      </main>

      {/* Bottom sticky bar */}
      <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white pb-safe">
        {isComplete ? (
          <div className="flex min-h-[56px] items-center gap-3 px-3 py-2">
            <p className="min-w-0 flex-1 truncate text-sm text-slate-600">
              All {total} stops done · {shortAddress(depot.address)}
            </p>
            <NavigateLink
              lat={depot.lat}
              lng={depot.lng}
              ariaLabel={`Return to depot, ${depot.name} (opens Google Maps)`}
              className="shrink-0"
            >
              Return to depot
            </NavigateLink>
          </div>
        ) : (
          <div className="flex min-h-[48px] items-center gap-2 px-4">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: driver.color }}
            />
            <p className="min-w-0 flex-1 truncate text-sm text-slate-700 tabular-nums">
              {nextStop ? (
                <>
                  <span className="text-slate-500">Next: </span>
                  <span className="font-medium text-slate-900">{shortAddress(nextStop.address)}</span>
                  {nextEta && <span className="text-slate-500"> · ETA {to12h(nextEta)}</span>}
                </>
              ) : (
                'Loading next stop…'
              )}
            </p>
            <span className="shrink-0 text-xs text-slate-500 tabular-nums">{total - done} left</span>
          </div>
        )}
      </div>

      <DeliverySheet
        open={deliverStop !== null}
        stop={deliverStop}
        onConfirm={confirmDelivery}
        onClose={cancelSheet}
      />
      <FailReasonSheet
        open={failStop !== null}
        stop={failStop}
        onPick={(reason, note) => {
          if (failStopId) markFailed(failStopId, reason, note);
        }}
        onClose={cancelSheet}
      />
      <StopDetailsSheet
        stop={detailsStop}
        position={detailsIndex >= 0 ? detailsIndex + 1 : undefined}
        eta={detailsStopId ? route.etaByStopId[detailsStopId] : undefined}
        onClose={() => setDetailsStopId(null)}
        onDelivered={openDeliverySheet}
        onFailed={openFailSheet}
        onUndo={markPending}
        onSkip={canSkip ? skipStop : undefined}
      />
      <ActivityLogSheet
        open={logOpen}
        events={events}
        stopsById={stopsById}
        onClose={() => setLogOpen(false)}
      />

      {/* Rendered here (not in the root layout) and lifted above the bottom bar. */}
      <Toast bottomOffset={BOTTOM_BAR_TOAST_OFFSET} />
    </DriverFrame>
  );
}

// ---------------------------------------------------------------------------
// Small local pieces
// ---------------------------------------------------------------------------

function BackToDriversLink() {
  return (
    <Link
      href="/driver"
      className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-medium text-slate-700 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
    >
      Back to drivers
    </Link>
  );
}

/**
 * Shown while the screen builds a plan for a driver who arrived before anyone
 * optimized. A spinner plus the silhouette of the card that is about to
 * appear — the driver's next action is to wait a moment, not to call dispatch.
 */
function PreparingRoute() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 py-4">
      <div className="flex items-center gap-2 text-slate-700">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        <p className="text-base font-medium">Preparing your route…</p>
      </div>
      <p className="max-w-xs text-center text-sm text-slate-600">
        Planning today&apos;s stops in the best order. This takes a moment.
      </p>
      <Card className="w-full space-y-3 p-4" aria-hidden="true">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Skeleton className="h-[52px] rounded-xl" />
          <Skeleton className="h-[52px] rounded-xl" />
        </div>
      </Card>
    </div>
  );
}

/** Frame + plain header + centered content for the empty/error states. */
function StateScreen({
  title,
  subtitle,
  color,
  children,
}: {
  title: string;
  subtitle?: string;
  color?: string;
  children: ReactNode;
}) {
  return (
    <DriverFrame>
      <DriverPlainHeader
        title={subtitle ? `${title} · ${subtitle}` : title}
        right={
          color ? (
            <span aria-hidden="true" className="mr-1 size-3 rounded-full" style={{ backgroundColor: color }} />
          ) : undefined
        }
      />
      <main className="flex flex-1 flex-col justify-center px-4 py-8">{children}</main>
      {/* Preparation failures and load errors toast from these states too. */}
      <Toast />
    </DriverFrame>
  );
}

/** Same silhouette as the loaded screen, shown before hydration / seed load. */
function RouteScreenSkeleton() {
  return (
    <DriverFrame>
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white pt-safe" aria-hidden="true">
        <div className="flex min-h-14 items-center gap-3 px-4">
          <Skeleton className="size-6 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="h-[3px] w-full bg-slate-100" />
      </div>
      <main className="flex flex-1 flex-col px-3 py-3">
        {/* <main> may not carry role=status; the live region is an inner div. */}
        <div className="flex flex-1 flex-col gap-3" role="status" aria-busy="true" aria-label="Loading route">
          <Card className="space-y-3 p-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Skeleton className="h-[52px] rounded-xl" />
              <Skeleton className="h-[52px] rounded-xl" />
            </div>
            <Skeleton className="h-11 rounded-xl" />
          </Card>
          {/* A real image (the 6 KB map placeholder), not a grey box: it is the
              only contentful element in this server-rendered skeleton, so it
              gives the page a First Contentful Paint / LCP candidate before
              any JavaScript has run (see MapSkeleton). `decorative` because the
              wrapper above is already the live region announcing "Loading
              route" — nested ones announce the same wait twice. */}
          <div className="h-[35dvh] min-h-[220px] overflow-hidden rounded-xl">
            <MapSkeleton decorative />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
        </div>
      </main>
    </DriverFrame>
  );
}
