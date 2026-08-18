'use client';

import './driver.css';

import { Inbox, Route as RouteIcon, UserX, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Button, Card, EmptyState, Skeleton, Toast } from '@/components/ui';
import { shortAddress } from '@/lib/geo';
import { to12h } from '@/lib/time';
import type { FailureReason, Stop } from '@/lib/types';
import { driverProgress, useAppStore, useHasHydrated } from '@/store/useAppStore';

import { DriverFrame } from './DriverFrame';
import { DriverHeader, DriverPlainHeader } from './DriverHeader';
import { DriverMap } from './DriverMap';
import { DriverStopList } from './DriverStopList';
import { FailReasonSheet } from './FailReasonSheet';
import { NavigateLink } from './NavigateLink';
import { NextStopCard } from './NextStopCard';
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
 */
export function DriverRouteScreen({ driverId }: DriverRouteScreenProps) {
  const hydrated = useHasHydrated();

  // Raw slices only (see the store's selector note); derive below with useMemo.
  const depot = useAppStore((s) => s.depot);
  const drivers = useAppStore((s) => s.drivers);
  const stops = useAppStore((s) => s.stops);
  const routes = useAppStore((s) => s.routes);
  const isOptimizing = useAppStore((s) => s.isOptimizing);
  const activeDriverId = useAppStore((s) => s.activeDriverId);
  const loadSeed = useAppStore((s) => s.loadSeed);
  const optimize = useAppStore((s) => s.optimize);
  const setActiveDriver = useAppStore((s) => s.setActiveDriver);
  const setStopStatus = useAppStore((s) => s.setStopStatus);
  const showToast = useAppStore((s) => s.showToast);

  // Load data once hydrated (no-op when the persisted state already has it).
  useEffect(() => {
    if (hydrated) void loadSeed();
  }, [hydrated, loadSeed]);

  const driver = useMemo(() => drivers.find((d) => d.id === driverId), [drivers, driverId]);

  // Remember this driver as the "last used" one on the picker.
  useEffect(() => {
    if (hydrated && driver && activeDriverId !== driver.id) setActiveDriver(driver.id);
  }, [hydrated, driver, activeDriverId, setActiveDriver]);

  const route = useMemo(() => routes?.find((r) => r.driverId === driverId), [routes, driverId]);
  const stopsById = useMemo(() => {
    const byId: Record<string, Stop> = {};
    for (const s of stops) byId[s.id] = s;
    return byId;
  }, [stops]);
  const progress = useMemo(() => driverProgress(route, stopsById), [route, stopsById]);

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
  const [failStopId, setFailStopId] = useState<string | null>(null);
  const [detailsStopId, setDetailsStopId] = useState<string | null>(null);
  const failStop = failStopId ? (stopsById[failStopId] ?? null) : null;
  const detailsStop = detailsStopId ? stopsById[detailsStopId] : undefined;

  // ---- focus management -----------------------------------------------------
  // The Next Stop card is keyed on the stop id, so Delivered/Failed re-mount
  // it and the button that was just activated leaves the DOM (focus would fall
  // to <body>). When the action came from the card's own buttons we move focus
  // deliberately onto the new card's heading (or the Route complete heading).
  // Actions from the details sheet are left to the dialog, which returns focus
  // to the row that opened it.
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
  const markDelivered = useCallback(
    (stopId: string) => {
      const stop = stopsById[stopId];
      if (!stop) return;
      setStopStatus(stopId, 'delivered');
      showToast(`Delivered · ${shortAddress(stop.address)}`, 'success');
      setDetailsStopId(null);
    },
    [stopsById, setStopStatus, showToast],
  );

  const markFailed = useCallback(
    (stopId: string, reason: FailureReason) => {
      if (!stopsById[stopId]) return;
      setStopStatus(stopId, 'failed', reason);
      showToast(`Marked failed · ${reason}`, 'info');
      setFailStopId(null);
      setDetailsStopId(null);
    },
    [stopsById, setStopStatus, showToast],
  );

  const markPending = useCallback(
    (stopId: string) => {
      const stop = stopsById[stopId];
      if (!stop) return;
      setStopStatus(stopId, 'pending');
      showToast(`Marked pending · ${shortAddress(stop.address)}`, 'info');
      setDetailsStopId(null);
    },
    [stopsById, setStopStatus, showToast],
  );

  const openFailSheet = useCallback((stopId: string) => {
    setDetailsStopId(null);
    setFailStopId(stopId);
  }, []);

  // Card-button variants: flag that the follow-up focus belongs to the card.
  const cardDelivered = useCallback(
    (stopId: string) => {
      pendingFocusRef.current = true;
      markDelivered(stopId);
    },
    [markDelivered],
  );
  const cardFailed = useCallback(
    (stopId: string) => {
      pendingFocusRef.current = true;
      openFailSheet(stopId);
    },
    [openFailSheet],
  );
  const cancelFailSheet = useCallback(() => {
    // Cancelled from the card path: nothing re-mounts, the dialog restores focus.
    pendingFocusRef.current = false;
    setFailStopId(null);
  }, []);

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
    return (
      <StateScreen title={driver.name} subtitle={driver.vehicle} color={driver.color}>
        <EmptyState
          icon={<RouteIcon className="size-6" aria-hidden="true" />}
          title="Routes not optimized yet — ask dispatch"
          description="Your route appears here as soon as the dispatcher runs the optimizer."
          action={
            <div className="flex flex-col items-center gap-3">
              <Button
                size="lg"
                loading={isOptimizing}
                icon={<Wand2 className="size-4" />}
                onClick={() => void optimize()}
              >
                {isOptimizing ? 'Optimizing…' : 'Optimize now (demo)'}
              </Button>
              <BackToDriversLink />
            </div>
          }
        />
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

  return (
    <DriverFrame>
      <DriverHeader driver={driver} done={done} total={total} />

      <main className="flex flex-1 flex-col gap-3 px-3 py-3">
        {isComplete ? (
          <RouteCompleteCard
            route={route}
            driver={driver}
            stopsById={stopsById}
            delivered={delivered}
            failed={failed}
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

      <FailReasonSheet
        open={failStop !== null}
        stop={failStop}
        onPick={(reason) => {
          if (failStopId) markFailed(failStopId, reason);
        }}
        onClose={cancelFailSheet}
      />
      <StopDetailsSheet
        stop={detailsStop}
        position={detailsIndex >= 0 ? detailsIndex + 1 : undefined}
        eta={detailsStopId ? route.etaByStopId[detailsStopId] : undefined}
        onClose={() => setDetailsStopId(null)}
        onDelivered={markDelivered}
        onFailed={openFailSheet}
        onUndo={markPending}
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
      {/* "Optimize now (demo)" and load errors toast from these states too. */}
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
          <Skeleton className="h-[35dvh] min-h-[220px] rounded-xl" />
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
