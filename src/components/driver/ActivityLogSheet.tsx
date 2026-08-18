'use client';

import { Check, MoveDown, Undo2, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { shortAddress } from '@/lib/geo';
import { formatClock } from '@/lib/time';
import type { DeliveryEvent, Stop } from '@/lib/types';

import { DriverDialog } from './DriverDialog';
import { DELIVERY_METHOD_SHORT } from './report';

export interface ActivityLogSheetProps {
  open: boolean;
  /** Already filtered to this driver and sorted newest-first. */
  events: DeliveryEvent[];
  stopsById: Record<string, Stop>;
  onClose: () => void;
}

interface TypeMeta {
  label: string;
  icon: ReactNode;
  badge: string;
  text: string;
}

const TYPE_META: Record<DeliveryEvent['type'], TypeMeta> = {
  delivered: {
    label: 'Delivered',
    icon: <Check className="size-4" strokeWidth={3} aria-hidden="true" />,
    badge: 'bg-emerald-600 text-white',
    text: 'text-emerald-700',
  },
  failed: {
    label: 'Failed',
    icon: <X className="size-4" strokeWidth={3} aria-hidden="true" />,
    badge: 'bg-red-600 text-white',
    text: 'text-red-700',
  },
  deferred: {
    label: 'Skipped',
    icon: <MoveDown className="size-4" strokeWidth={2.5} aria-hidden="true" />,
    badge: 'bg-amber-500 text-slate-900',
    text: 'text-amber-800',
  },
  undo: {
    label: 'Undone',
    icon: <Undo2 className="size-4" strokeWidth={2.5} aria-hidden="true" />,
    badge: 'bg-slate-500 text-white',
    text: 'text-slate-700',
  },
};

/** "9:41 AM" from an ISO timestamp; falls back to the raw string. */
function isoTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : formatClock(d);
}

/**
 * Today's activity for one driver, newest first — the record a dispatcher (or
 * the driver themselves) asks about later: "when did you attempt 909 Williamson
 * St and what happened?". Read-only on purpose; corrections are made on the
 * stop itself, which appends a new event rather than rewriting history.
 *
 * Returns null while closed (rather than relying on `DriverDialog` to drop the
 * panel) so the rows — one per event of the day — are only built when the sheet
 * is actually on screen.
 */
export function ActivityLogSheet({ open, events, stopsById, onClose }: ActivityLogSheetProps) {
  if (!open) return null;
  return (
    <DriverDialog
      open={open}
      onClose={onClose}
      title="Activity log"
      description={
        events.length === 0
          ? 'Nothing recorded yet today'
          : `${events.length} ${events.length === 1 ? 'entry' : 'entries'} today · newest first`
      }
    >
      {events.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-600">
          Every delivery, failed attempt, skip and undo you record shows up here.
        </p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {events.map((e) => {
            // Defence in depth: the store's persisted-blob guard already drops
            // events whose type this build cannot render, but a row is not
            // worth crashing the whole screen over if one ever gets through.
            const meta: TypeMeta | undefined = TYPE_META[e.type];
            if (!meta) return null;
            const stop = stopsById[e.stopId];
            const detail =
              e.type === 'failed'
                ? (e.reason ?? '')
                : e.type === 'delivered'
                  ? (e.method ? DELIVERY_METHOD_SHORT[e.method] : '')
                  : '';
            // Only the outcome that is currently STANDING owns the photo: the
            // image lives on the stop, so after an undo + a re-delivery with a
            // new picture, the older row would otherwise illustrate itself with
            // the newer photo. `proof.at` is stamped from the same instant as
            // the event that created it.
            const proof = stop?.proof;
            const proofPhoto = e.hasPhoto && proof && proof.at === e.at ? proof.photo : undefined;
            return (
              <li key={e.id} className="flex items-start gap-3 py-3">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${meta.badge}`}
                >
                  {meta.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className={`text-sm font-semibold ${meta.text}`}>{meta.label}</span>
                    <span className="text-xs text-slate-500 tabular-nums">{isoTime(e.at)}</span>
                  </p>
                  <p className="truncate text-sm text-slate-900">
                    {stop ? shortAddress(stop.address) : e.stopId}
                  </p>
                  {detail && <p className="text-xs text-slate-600">{detail}</p>}
                  {e.recipientName && <p className="text-xs text-slate-600">Received by {e.recipientName}</p>}
                  {e.note && <p className="mt-0.5 text-sm text-slate-700">{e.note}</p>}
                </div>
                {proofPhoto && (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL
                  <img
                    src={proofPhoto}
                    alt={`Proof photo for ${stop ? shortAddress(stop.address) : e.stopId}`}
                    className="size-12 shrink-0 rounded-lg border border-slate-200 object-cover"
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </DriverDialog>
  );
}
