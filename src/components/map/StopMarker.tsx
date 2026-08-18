'use client';

// A single delivery stop on the map: memoised divIcon marker + rich popup.

import { memo, useEffect, useMemo, useRef, type ChangeEvent } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import type { LeafletEventHandlerFnMap, Marker as LeafletMarker } from 'leaflet';
import type { Driver, Priority, Stop, StopStatus } from '@/lib/types';
import { formatWindow, to12h } from '@/lib/time';
import { stopIcon, UNASSIGNED_COLOR } from './icons';

export interface StopMarkerProps {
  stop: Stop;
  /** Driver colour when assigned; omit/undefined for unassigned (slate-400). */
  color?: string;
  /** 1-based position along the driver's route, or null when unrouted / numbering off. */
  seq?: number | null;
  /** Arrival "HH:MM" from `route.etaByStopId`, or null when unrouted. */
  eta?: string | null;
  /** Id of the driver this stop is currently assigned to (for the reassign select). */
  assignedDriverId?: string | null;
  /** Whether this stop is the selected one (opens popup, draws ring). */
  selected?: boolean;
  /** Drivers offered by the reassign select (only used when `onReassign` is set). */
  drivers?: Driver[];
  onSelectStop?: (stopId: string | null) => void;
  onReassign?: (stopId: string, toDriverId: string) => void;
}

const PRIORITY_LABEL: Record<Priority, string> = {
  standard: 'Standard',
  priority: 'Priority',
  overnight: 'Overnight',
};

/** Inline chip styles (deliberately not importing ../ui, which is built concurrently). */
const PRIORITY_CHIP_CLASS: Record<Priority, string> = {
  standard: 'bg-slate-100 text-slate-700 ring-slate-200',
  priority: 'bg-amber-50 text-amber-800 ring-amber-200',
  overnight: 'bg-violet-50 text-violet-800 ring-violet-200',
};

const STATUS_LABEL: Record<StopStatus, string> = {
  pending: 'Pending',
  delivered: 'Delivered',
  failed: 'Failed',
};

const STATUS_CLASS: Record<StopStatus, string> = {
  pending: 'text-slate-600',
  delivered: 'text-green-700',
  failed: 'text-red-700',
};

function StopMarkerImpl({
  stop,
  color,
  seq = null,
  eta = null,
  assignedDriverId = null,
  selected = false,
  drivers = [],
  onSelectStop,
  onReassign,
}: StopMarkerProps) {
  const map = useMap();
  const markerRef = useRef<LeafletMarker | null>(null);

  const icon = useMemo(
    () =>
      stopIcon({
        color: color ?? UNASSIGNED_COLOR,
        seq,
        priority: stop.priority,
        status: stop.status,
        selected,
      }),
    [color, seq, stop.priority, stop.status, selected],
  );

  const position = useMemo<[number, number]>(() => [stop.lat, stop.lng], [stop.lat, stop.lng]);

  // Marker click selects; closing the popup (X, map click, another marker
  // opening) deselects — but only if we are still the selected stop, so an
  // externally-driven switch A → B does not bounce the selection to null.
  const eventHandlers = useMemo<LeafletEventHandlerFnMap>(
    () => ({
      click: () => onSelectStop?.(stop.id),
      popupclose: () => {
        if (selected) onSelectStop?.(null);
      },
    }),
    [onSelectStop, selected, stop.id],
  );

  // React to external selection: open our popup, panning first when off-screen.
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    if (selected) {
      const latlng = marker.getLatLng();
      if (!map.getBounds().contains(latlng)) {
        map.panTo(latlng, { animate: true });
      }
      if (!marker.isPopupOpen()) marker.openPopup();
    } else if (marker.isPopupOpen()) {
      marker.closePopup();
    }
  }, [selected, map]);

  const handleReassign = (e: ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (next && next !== assignedDriverId) onReassign?.(stop.id, next);
  };

  const selectId = `riq-reassign-${stop.id}`;

  return (
    <Marker
      ref={markerRef}
      position={position}
      icon={icon}
      alt={stop.address}
      title={stop.address}
      keyboard
      riseOnHover
      zIndexOffset={selected ? 1000 : 0}
      eventHandlers={eventHandlers}
    >
      <Popup className="riq-popup" maxWidth={280} minWidth={200} autoPanPadding={[24, 24]}>
        <div className="space-y-1.5 text-sm text-slate-900">
          <p className="pr-6 font-medium leading-snug">{stop.address}</p>
          <p className="text-slate-600">
            {stop.recipient}
            <span aria-hidden="true"> · </span>
            <span className="tabular-nums">
              {stop.packages} {stop.packages === 1 ? 'pkg' : 'pkgs'}
            </span>
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${PRIORITY_CHIP_CLASS[stop.priority]}`}
            >
              {PRIORITY_LABEL[stop.priority]}
            </span>
            <span className={`text-xs font-medium ${STATUS_CLASS[stop.status]}`}>
              {STATUS_LABEL[stop.status]}
            </span>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-slate-500">Window</dt>
            <dd className="tabular-nums text-slate-800">
              {stop.timeWindow ? formatWindow(stop.timeWindow) : 'Any time'}
            </dd>
            <dt className="text-slate-500">ETA</dt>
            <dd className="tabular-nums text-slate-800">{eta ? to12h(eta) : '—'}</dd>
            <dt className="text-slate-500">Service</dt>
            <dd className="tabular-nums text-slate-800">{stop.serviceMinutes} min</dd>
          </dl>

          {stop.notes ? <p className="text-xs italic text-slate-600">{stop.notes}</p> : null}

          {onReassign && drivers.length > 0 ? (
            <div className="pt-1">
              <label htmlFor={selectId} className="mb-1 block text-xs font-medium text-slate-700">
                Reassign to…
              </label>
              <select
                id={selectId}
                value={assignedDriverId ?? ''}
                onChange={handleReassign}
                className="block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {assignedDriverId ? null : (
                  <option value="" disabled>
                    Unassigned — choose a driver
                  </option>
                )}
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {d.vehicle}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      </Popup>
    </Marker>
  );
}

/** Memoised: only re-renders when its own props change (colour, seq, status, selection…). */
export const StopMarker = memo(StopMarkerImpl);
StopMarker.displayName = 'StopMarker';
