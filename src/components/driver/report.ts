// End-of-day reporting for one driver: which events belong to them, the day's
// summary numbers, and the two downloadable artefacts (CSV per stop, JSON per
// event). Pure functions with no DOM and no store import, so they are unit
// testable and safe to call from a server bundle.

import type { DeliveryEvent, DeliveryMethod, Driver, Route, Stop } from '@/lib/types';

/** Human labels for the delivery methods (also used by the sheets). */
export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  handed: 'Handed to recipient',
  door: 'Left at door',
  neighbour: 'Left with neighbour',
  desk: 'Front desk / mailroom',
};

/** Short labels for tight spots (log rows, CSV). */
export const DELIVERY_METHOD_SHORT: Record<DeliveryMethod, string> = {
  handed: 'Handed over',
  door: 'At door',
  neighbour: 'Neighbour',
  desk: 'Front desk',
};

export function methodLabel(method: DeliveryMethod | undefined): string {
  return method ? DELIVERY_METHOD_LABELS[method] : '';
}

/** True when `iso` falls on the same *local* calendar day as `day`. */
export function isSameLocalDay(iso: string, day: Date): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.toDateString() === day.toDateString();
}

/**
 * `YYYY-MM-DD HH:MM` on the reader's own clock (empty for an unparseable
 * timestamp). Hand-formatted, no Intl — see DECISIONS #42.
 */
export function localStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * The events belonging to one driver **today**, newest first. Matches on the
 * event's own `driverId` (stamped when it happened) OR on the route the stop
 * sits in today — a stop reassigned after the fact still shows in the log of
 * whoever actually attempted it, and a stop attempted before any plan existed
 * (driverId '') still shows up for the driver who now owns it.
 *
 * "Today" is the LOCAL calendar day of `now` (injected so it is testable).
 * The log is append-only and persisted, so without this filter a device that
 * was not reset kept counting yesterday's deliveries into "N entries today",
 * the header count and — worst — `summarizeDay().actualMinutes`, which is the
 * span between the first and the last event and would have read "27h 10m".
 * Older events stay in the store (nothing is deleted); they are simply not
 * part of today's picture.
 */
export function eventsForDriver(
  log: readonly DeliveryEvent[],
  driverId: string,
  route?: Route,
  now: Date = new Date(),
): DeliveryEvent[] {
  const own = route ? new Set(route.stopIds) : null;
  return log
    .filter((e) => e.driverId === driverId || (!e.driverId && own?.has(e.stopId)))
    .filter((e) => isSameLocalDay(e.at, now))
    .slice()
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export interface DaySummary {
  delivered: number;
  failed: number;
  deferred: number;
  /** ISO of the first / last event of the day, null when nothing happened yet. */
  firstAt: string | null;
  lastAt: string | null;
  /** Wall-clock minutes between the first and the last event (0 when < 2 events). */
  actualMinutes: number;
}

/**
 * Counts + elapsed time from a driver's events. `delivered` / `failed` count
 * *outcomes still standing*: an undo cancels the most recent outcome for that
 * stop, so a mis-tap that was corrected does not inflate the day's numbers.
 */
export function summarizeDay(events: readonly DeliveryEvent[]): DaySummary {
  // Walk oldest → newest so "the last outcome per stop wins" is a simple scan.
  const chronological = events.slice().sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const outcomeByStop = new Map<string, 'delivered' | 'failed'>();
  let deferred = 0;
  for (const e of chronological) {
    if (e.type === 'delivered' || e.type === 'failed') outcomeByStop.set(e.stopId, e.type);
    else if (e.type === 'undo') outcomeByStop.delete(e.stopId);
    else if (e.type === 'deferred') deferred += 1;
  }
  let delivered = 0;
  let failed = 0;
  for (const outcome of outcomeByStop.values()) {
    if (outcome === 'delivered') delivered += 1;
    else failed += 1;
  }
  const firstAt = chronological[0]?.at ?? null;
  const lastAt = chronological[chronological.length - 1]?.at ?? null;
  let actualMinutes = 0;
  if (firstAt && lastAt) {
    const ms = new Date(lastAt).getTime() - new Date(firstAt).getTime();
    if (Number.isFinite(ms) && ms > 0) actualMinutes = Math.round(ms / 60000);
  }
  return { delivered, failed, deferred, firstAt, lastAt, actualMinutes };
}

/**
 * One CSV field: neutralised against formula injection, then quoted only when
 * it needs it (comma, quote, CR/LF).
 *
 * A field that starts with `=`, `+`, `-`, `@`, a tab or a CR is executed as a
 * formula by Excel / Sheets / LibreOffice when the file is opened, and these
 * fields carry driver-typed text (a note, a recipient name), so
 * `=HYPERLINK("http://evil","Click")` in a note would become a live link in
 * the depot supervisor's spreadsheet. Prefixing a single quote makes the cell
 * literal text; the quote itself is not shown by the spreadsheet.
 */
export function csvField(value: string | number | undefined | null): string {
  const text = value === undefined || value === null ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Columns of the per-stop report. The timestamp is emitted twice on purpose:
 * `at (local ...)` is what a human compares with `plannedEta` (also a local
 * clock time), `atIso (UTC)` is the machine-readable one — a single UTC column
 * next to a local ETA made a delivery look hours late.
 */
export const REPORT_CSV_HEADER = [
  'seq',
  'address',
  'recipient',
  'packages',
  'plannedEta (local HH:MM)',
  'outcome',
  'at (local YYYY-MM-DD HH:MM)',
  'atIso (UTC)',
  'methodOrReason',
  'recipientName',
  'note',
] as const;

export interface RouteReportInput {
  route: Route;
  stopsById: Record<string, Stop>;
  /** The driver's events (any order). */
  events: readonly DeliveryEvent[];
}

/** The most recent delivered/failed event per stop (undo clears it). */
function lastOutcomeByStop(events: readonly DeliveryEvent[]): Map<string, DeliveryEvent> {
  const byStop = new Map<string, DeliveryEvent>();
  const chronological = events.slice().sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  for (const e of chronological) {
    if (e.type === 'delivered' || e.type === 'failed') byStop.set(e.stopId, e);
    else if (e.type === 'undo') byStop.delete(e.stopId);
  }
  return byStop;
}

/**
 * One row per stop of the route, in route order — the sheet a depot supervisor
 * expects. Rows are emitted for pending stops too (outcome `pending`), so the
 * report is a complete manifest rather than only what got done.
 * Line endings are CRLF: Excel treats a bare LF file as one single row.
 */
export function buildRouteReportCsv({ route, stopsById, events }: RouteReportInput): string {
  const outcomes = lastOutcomeByStop(events);
  const rows: string[] = [REPORT_CSV_HEADER.join(',')];
  route.stopIds.forEach((id, i) => {
    const stop = stopsById[id];
    if (!stop) return;
    const event = outcomes.get(id);
    const outcome = event?.type ?? stop.status;
    const methodOrReason =
      event?.type === 'failed'
        ? (event.reason ?? '')
        : methodLabel(event?.method ?? stop.proof?.method);
    const at = event?.at ?? stop.deliveredAt ?? '';
    rows.push(
      [
        i + 1,
        stop.address,
        stop.recipient,
        stop.packages,
        route.etaByStopId[id] ?? '',
        outcome,
        at ? localStamp(at) : '',
        at,
        methodOrReason,
        event?.recipientName ?? stop.proof?.recipientName ?? '',
        event?.note ?? stop.proof?.note ?? '',
      ]
        .map(csvField)
        .join(','),
    );
  });
  // No trailing metadata line (it would break parsers) — the driver identity
  // lives in the filename instead: routeiq-report-<driver>-<date>.csv.
  return `${rows.join('\r\n')}\r\n`;
}

/** The raw event stream for the day, pretty-printed (audit trail / import). */
export function buildEventsJson({
  driver,
  route,
  events,
}: {
  driver: Driver;
  route: Route;
  events: readonly DeliveryEvent[];
}): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      driver: { id: driver.id, name: driver.name, vehicle: driver.vehicle },
      route: { stopIds: route.stopIds, plannedMinutes: route.totalMinutes, plannedKm: route.totalDistanceKm },
      summary: summarizeDay(events),
      events: events.slice().sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)),
    },
    null,
    2,
  );
}
