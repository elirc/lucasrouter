// "HH:MM" helpers. All math is done in minutes-since-midnight.
//
// Times are "HH:MM" on the clock of the day the shift started. Like GTFS, an
// hour may run past 23 ("25:13" = 01:13 the next day) so that ETAs stay
// monotonic and comparable to a same-day time window when a route crosses
// midnight; `to12h` renders such times as "1:13 AM +1". Inputs (windows,
// shift starts) are validated to 00:00-23:59 by the API schema.

/** Largest hour `parseHHMM` accepts (a few days out, plenty for any route). */
const MAX_HOUR = 99;

/**
 * Parse "HH:MM" into minutes since midnight of the shift day. Hours may exceed
 * 23 for times past midnight (see the file header). Throws on malformed input.
 */
export function parseHHMM(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`Invalid HH:MM time: "${hhmm}"`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > MAX_HOUR || min < 0 || min > 59) {
    throw new Error(`Invalid HH:MM time: "${hhmm}"`);
  }
  return h * 60 + min;
}

/**
 * Format minutes since midnight as zero-padded "HH:MM". Does NOT wrap past
 * midnight: 1513 -> "25:13", so a schedule that runs into the next day keeps
 * increasing ETAs (negative input clamps to "00:00").
 */
export function formatHHMM(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Add minutes to an "HH:MM" string. */
export function addMinutes(hhmm: string, minutes: number): string {
  return formatHHMM(parseHHMM(hhmm) + minutes);
}

/** Human duration, e.g. 75 -> "1h 15m", 45 -> "45m", 0 -> "0m". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Format an "HH:MM" 24h time as "9:05 AM" for display; times past midnight
 * (hour >= 24) get a day suffix: "25:13" -> "1:13 AM +1". Tolerant: anything
 * `parseHHMM` rejects is returned unchanged rather than thrown, so a malformed
 * ETA from a swapped-in optimizer degrades to raw text instead of a blank
 * screen.
 */
export function to12h(hhmm: string): string {
  let mins: number;
  try {
    mins = parseHHMM(hhmm);
  } catch {
    return hhmm;
  }
  const days = Math.floor(mins / 1440);
  const h24 = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}${days > 0 ? ` +${days}` : ''}`;
}

/** Format a time window compactly, e.g. "9:00–11:00 AM" / "1:00–3:00 PM". */
export function formatWindow(w: { start: string; end: string }): string {
  const s = to12h(w.start);
  const e = to12h(w.end);
  const [sTime, sSuffix] = s.split(' ');
  const [eTime, eSuffix] = e.split(' ');
  return sSuffix === eSuffix ? `${sTime}–${eTime} ${eSuffix}` : `${s}–${e}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Long-form date for headers, e.g. "Monday, Aug 17" (en-US, local time).
 * Hand-formatted on purpose: the first `Intl.DateTimeFormat` /
 * `toLocaleDateString` call loads ICU locale data and measured ~180 ms on a
 * mid-range phone profile — a visible chunk of Total Blocking Time for one
 * header string.
 */
export function formatTodayLong(date: Date = new Date()): string {
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`;
}

/** Wall-clock time of a Date as "6:44 PM" (local time, en-US style, no Intl). */
export function formatClock(date: Date): string {
  return to12h(formatHHMM(date.getHours() * 60 + date.getMinutes()));
}
