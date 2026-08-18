'use client';

import { Check, RotateCcw, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button, PriorityBadge, StatusPill } from '@/components/ui';
import { formatClock, formatWindow, to12h } from '@/lib/time';
import type { Stop } from '@/lib/types';

import { DriverDialog } from './DriverDialog';
import { isEtaLate } from './NextStopCard';
import { NavigateLink } from './NavigateLink';

export interface StopDetailsSheetProps {
  /** Null/undefined closes the sheet. */
  stop: Stop | null | undefined;
  /** 1-based position in the route (for the heading). */
  position?: number;
  eta?: string;
  onClose: () => void;
  onDelivered: (stopId: string) => void;
  /** Opens the fail-reason picker for this stop. */
  onFailed: (stopId: string) => void;
  onUndo: (stopId: string) => void;
}

/** "9:41 AM" from an ISO timestamp (local time). */
function formatIsoTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatClock(d);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

/**
 * Full details for any stop in the list, with status-appropriate actions:
 * pending → Delivered / Failed; delivered or failed → Undo (mark pending).
 * A Navigate link is always available.
 */
export function StopDetailsSheet({
  stop,
  position,
  eta,
  onClose,
  onDelivered,
  onFailed,
  onUndo,
}: StopDetailsSheetProps) {
  const open = !!stop;
  const late = stop ? isEtaLate(eta, stop.timeWindow) : false;
  return (
    <DriverDialog
      open={open}
      onClose={onClose}
      title={stop ? stop.address : 'Stop'}
      description={stop && position ? `Stop #${position} · ${stop.recipient}` : stop?.recipient}
    >
      {stop && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={stop.status} />
            <PriorityBadge priority={stop.priority} />
          </div>

          <dl className="mt-2 divide-y divide-slate-100">
            <Row label="Recipient">{stop.recipient}</Row>
            <Row label="Packages">
              <span className="tabular-nums">
                {stop.packages} {stop.packages === 1 ? 'pkg' : 'pkgs'}
              </span>
            </Row>
            {stop.timeWindow && (
              <Row label="Time window">
                <span className="tabular-nums">{formatWindow(stop.timeWindow)}</span>
              </Row>
            )}
            {eta && (
              <Row label="Planned ETA">
                <span className={late ? 'text-amber-700 tabular-nums' : 'tabular-nums'}>
                  {to12h(eta)}
                  {late && ' · after window'}
                </span>
              </Row>
            )}
            {stop.deliveredAt && (
              <Row label={stop.status === 'failed' ? 'Attempted at' : 'Delivered at'}>
                <span className="tabular-nums">{formatIsoTime(stop.deliveredAt)}</span>
              </Row>
            )}
            {stop.notes && (
              <div className="py-2.5">
                <dt className="text-sm text-slate-500">Notes</dt>
                <dd className="mt-0.5 text-sm text-slate-900">{stop.notes}</dd>
              </div>
            )}
          </dl>

          <div className="mt-3 flex flex-col gap-3">
            {stop.status === 'pending' ? (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  size="lg"
                  variant="primary"
                  data-autofocus="true"
                  icon={<Check className="size-5" strokeWidth={2.5} />}
                  onClick={() => onDelivered(stop.id)}
                >
                  Delivered
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  style={{ borderColor: '#fca5a5', color: '#b91c1c' }}
                  icon={<X className="size-5" strokeWidth={2.5} />}
                  onClick={() => onFailed(stop.id)}
                >
                  Failed
                </Button>
              </div>
            ) : (
              <Button
                size="lg"
                variant="secondary"
                fullWidth
                data-autofocus="true"
                icon={<RotateCcw className="size-4" />}
                onClick={() => onUndo(stop.id)}
              >
                Undo (mark pending)
              </Button>
            )}
            <NavigateLink
              lat={stop.lat}
              lng={stop.lng}
              fullWidth
              ariaLabel={`Navigate to ${stop.address} (opens Google Maps)`}
            >
              Navigate
            </NavigateLink>
          </div>
        </>
      )}
    </DriverDialog>
  );
}
