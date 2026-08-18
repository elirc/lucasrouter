import { describe, expect, it } from 'vitest';

import {
  buildEventsJson,
  buildRouteReportCsv,
  csvField,
  eventsForDriver,
  isSameLocalDay,
  localStamp,
  methodLabel,
  REPORT_CSV_HEADER,
  summarizeDay,
} from '@/components/driver/report';
import { dataUrlBytes, fitWithin, MAX_THUMB_PX, storedPhotoBytes } from '@/components/driver/photo';
import type { DeliveryEvent, Driver, Route, Stop } from '@/lib/types';

// Pure helpers behind the driver's activity log and end-of-day report. The DOM
// halves (canvas thumbnailing, the download click) are exercised by the smoke
// harness, not here.

const driver: Driver = {
  id: 'D1',
  name: 'Maya Thompson',
  vehicle: 'Van 12',
  color: '#2563eb',
  shiftStart: '08:00',
  capacityPackages: 60,
};

const stop = (id: string, over: Partial<Stop> = {}): Stop => ({
  id,
  address: `${id} Main St, Madison, WI 53703`,
  lat: 43.07,
  lng: -89.4,
  recipient: `Recipient ${id}`,
  packages: 2,
  priority: 'standard',
  serviceMinutes: 4,
  status: 'pending',
  ...over,
});

const route: Route = {
  driverId: 'D1',
  stopIds: ['A', 'B', 'C'],
  legs: [],
  totalDistanceKm: 12.5,
  totalMinutes: 95,
  etaByStopId: { A: '09:05', B: '09:40', C: '10:15' },
};

const event = (over: Partial<DeliveryEvent> & Pick<DeliveryEvent, 'id' | 'at' | 'stopId' | 'type'>): DeliveryEvent => ({
  driverId: 'D1',
  ...over,
});

// Timestamps are built from LOCAL wall-clock components so the "same calendar
// day" assertions below mean the same thing in every timezone the suite may run
// in (a fixed UTC string can land on either side of local midnight).
const at = (hour: number, minute = 0, day = 5): string => new Date(2024, 4, day, hour, minute).toISOString();
const NOON = new Date(2024, 4, 5, 12, 0);

describe('eventsForDriver()', () => {
  const log: DeliveryEvent[] = [
    event({ id: '1', at: at(9), stopId: 'A', type: 'delivered' }),
    event({ id: '2', at: at(9, 30), stopId: 'B', type: 'failed', driverId: 'D2' }),
    event({ id: '3', at: at(10), stopId: 'C', type: 'deferred' }),
    event({ id: '4', at: at(8), stopId: 'A', type: 'delivered', driverId: '' }),
  ];

  it('keeps this driver’s events, newest first', () => {
    expect(eventsForDriver(log, 'D1', route, NOON).map((e) => e.id)).toEqual(['3', '1', '4']);
    // D2 asks with its own (here: no) route, so D1's unattributed event stays out.
    expect(eventsForDriver(log, 'D2', undefined, NOON).map((e) => e.id)).toEqual(['2']);
  });

  it('adopts unattributed events for the driver who owns the stop today', () => {
    // id 4 has no driverId; it only appears because 'A' is on this route.
    expect(eventsForDriver(log, 'D1', undefined, NOON).map((e) => e.id)).toEqual(['3', '1']);
    expect(eventsForDriver([], 'D1', route, NOON)).toEqual([]);
  });

  it('is scoped to the local calendar day of `now`', () => {
    // The log is append-only and persisted: without this, a device that was not
    // reset counts yesterday's deliveries into "N entries today" and stretches
    // summarizeDay().actualMinutes across the night.
    const withYesterday: DeliveryEvent[] = [
      ...log,
      event({ id: 'y1', at: at(9, 0, 4), stopId: 'A', type: 'delivered' }),
      event({ id: 'y2', at: at(23, 59, 4), stopId: 'B', type: 'failed' }),
    ];
    expect(eventsForDriver(withYesterday, 'D1', route, NOON).map((e) => e.id)).toEqual(['3', '1', '4']);
    // Yesterday is not lost, it is simply not today: ask as of yesterday and
    // exactly those two come back.
    const yesterdayNoon = new Date(2024, 4, 4, 12, 0);
    expect(eventsForDriver(withYesterday, 'D1', route, yesterdayNoon).map((e) => e.id)).toEqual(['y2', 'y1']);
    // Midnight boundary: 23:59 belongs to the 4th, 00:00 to the 5th.
    expect(eventsForDriver([event({ id: 'm', at: at(0, 0), stopId: 'A', type: 'delivered' })], 'D1', route, NOON))
      .toHaveLength(1);
    // An unparseable timestamp belongs to no day at all.
    expect(eventsForDriver([event({ id: 'x', at: 'not-a-date', stopId: 'A', type: 'delivered' })], 'D1', route, NOON))
      .toEqual([]);
  });
});

describe('local-day helpers', () => {
  it('isSameLocalDay() compares calendar days, not 24-hour spans', () => {
    expect(isSameLocalDay(at(0, 0), NOON)).toBe(true);
    expect(isSameLocalDay(at(23, 59), NOON)).toBe(true);
    expect(isSameLocalDay(at(23, 59, 4), NOON)).toBe(false);
    expect(isSameLocalDay(at(0, 1, 6), NOON)).toBe(false);
    expect(isSameLocalDay('garbage', NOON)).toBe(false);
  });

  it('localStamp() renders the local calendar day and clock, zero-padded', () => {
    expect(localStamp(new Date(2024, 4, 5, 9, 2).toISOString())).toBe('2024-05-05 09:02');
    expect(localStamp(new Date(2024, 11, 31, 23, 5).toISOString())).toBe('2024-12-31 23:05');
    expect(localStamp('not-a-date')).toBe('');
  });
});

describe('summarizeDay()', () => {
  it('counts standing outcomes, skips, and the elapsed time', () => {
    const events: DeliveryEvent[] = [
      event({ id: '1', at: '2024-05-05T09:00:00.000Z', stopId: 'A', type: 'delivered' }),
      event({ id: '2', at: '2024-05-05T09:20:00.000Z', stopId: 'B', type: 'failed' }),
      event({ id: '3', at: '2024-05-05T09:25:00.000Z', stopId: 'C', type: 'deferred' }),
      event({ id: '4', at: '2024-05-05T10:30:00.000Z', stopId: 'C', type: 'delivered' }),
    ];
    expect(summarizeDay(events)).toEqual({
      delivered: 2,
      failed: 1,
      deferred: 1,
      firstAt: '2024-05-05T09:00:00.000Z',
      lastAt: '2024-05-05T10:30:00.000Z',
      actualMinutes: 90,
    });
  });

  it('lets an undo cancel the outcome it undid, and a re-attempt replace it', () => {
    const events: DeliveryEvent[] = [
      event({ id: '1', at: '2024-05-05T09:00:00.000Z', stopId: 'A', type: 'delivered' }),
      event({ id: '2', at: '2024-05-05T09:05:00.000Z', stopId: 'A', type: 'undo' }),
      event({ id: '3', at: '2024-05-05T09:10:00.000Z', stopId: 'B', type: 'failed' }),
      event({ id: '4', at: '2024-05-05T09:40:00.000Z', stopId: 'B', type: 'delivered' }),
    ];
    const summary = summarizeDay(events);
    expect(summary.delivered).toBe(1); // only B, and only once
    expect(summary.failed).toBe(0);
    expect(summary.actualMinutes).toBe(40);
  });

  it('is safe on an empty log and on a single event', () => {
    expect(summarizeDay([])).toEqual({
      delivered: 0,
      failed: 0,
      deferred: 0,
      firstAt: null,
      lastAt: null,
      actualMinutes: 0,
    });
    const one = summarizeDay([event({ id: '1', at: '2024-05-05T09:00:00.000Z', stopId: 'A', type: 'delivered' })]);
    expect(one.actualMinutes).toBe(0);
    expect(one.firstAt).toBe(one.lastAt);
  });
});

describe('csvField()', () => {
  it('quotes only what needs quoting and doubles inner quotes', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField(12)).toBe('12');
    expect(csvField(undefined)).toBe('');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line\nbreak')).toBe('"line\nbreak"');
  });

  it('neutralises formula injection: a driver’s note is text, never a formula', () => {
    // Notes and recipient names are free text typed on a phone and opened in
    // the depot's Excel/Sheets, where a leading = + - @ makes the cell live.
    expect(csvField('=HYPERLINK("http://evil.example","Click")')).toBe(
      '"\'=HYPERLINK(""http://evil.example"",""Click"")"',
    );
    expect(csvField('+1 555 0100')).toBe("'+1 555 0100");
    expect(csvField('-5 packages')).toBe("'-5 packages");
    expect(csvField('@channel')).toBe("'@channel");
    expect(csvField('\tleading tab')).toBe("'\tleading tab");
    expect(csvField('\rcarriage')).toBe('"\'\rcarriage"'); // prefixed AND quoted
    // Untouched otherwise — including a '=' that is not in the first position.
    expect(csvField('left at door = fine')).toBe('left at door = fine');
    expect(csvField(3)).toBe('3');
  });
});

describe('buildRouteReportCsv()', () => {
  const stopsById: Record<string, Stop> = {
    A: stop('A', { status: 'delivered', deliveredAt: '2024-05-05T09:02:00.000Z' }),
    B: stop('B', { status: 'failed', packages: 1, address: 'B "Main", St' }),
    C: stop('C'),
  };
  const events: DeliveryEvent[] = [
    event({
      id: '1',
      at: '2024-05-05T09:02:00.000Z',
      stopId: 'A',
      type: 'delivered',
      method: 'door',
      recipientName: 'Ana',
      note: 'left, by the bins',
    }),
    event({ id: '2', at: '2024-05-05T09:41:00.000Z', stopId: 'B', type: 'failed', reason: 'No one home' }),
  ];

  it('writes one CRLF row per stop in route order, with the documented columns', () => {
    const csv = buildRouteReportCsv({ route, stopsById, events });
    const lines = csv.trimEnd().split('\r\n');
    expect(lines).toHaveLength(4); // header + 3 stops
    expect(lines[0]).toBe(REPORT_CSV_HEADER.join(','));
    // The timestamp is emitted twice: local (what a human compares with the
    // local plannedEta) and the raw UTC ISO (what a machine reads).
    const atA = '2024-05-05T09:02:00.000Z';
    const atB = '2024-05-05T09:41:00.000Z';
    expect(lines[1]).toBe(
      `1,"A Main St, Madison, WI 53703",Recipient A,2,09:05,delivered,${localStamp(atA)},${atA},Left at door,Ana,"left, by the bins"`,
    );
    expect(lines[2]).toBe(
      `2,"B ""Main"", St",Recipient B,1,09:40,failed,${localStamp(atB)},${atB},No one home,,`,
    );
    // Not attempted yet: still a row, so the report is a full manifest.
    expect(lines[3]).toBe('3,"C Main St, Madison, WI 53703",Recipient C,2,10:15,pending,,,,,');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('falls back to the stop itself when there is no event, and skips unknown ids', () => {
    const csv = buildRouteReportCsv({
      route,
      stopsById: {
        A: stop('A', {
          status: 'delivered',
          deliveredAt: '2024-05-05T09:02:00.000Z',
          proof: { at: '2024-05-05T09:02:00.000Z', method: 'handed', recipientName: 'Bo', note: 'ok' },
        }),
      },
      events: [],
    });
    const lines = csv.trimEnd().split('\r\n');
    expect(lines).toHaveLength(2); // B and C are not in stopsById
    expect(lines[1]).toContain(
      `delivered,${localStamp('2024-05-05T09:02:00.000Z')},2024-05-05T09:02:00.000Z,Handed to recipient,Bo,ok`,
    );
  });

  it('ignores an outcome that was undone', () => {
    const csv = buildRouteReportCsv({
      route,
      stopsById,
      events: [
        ...events,
        event({ id: '3', at: '2024-05-05T09:50:00.000Z', stopId: 'B', type: 'undo' }),
      ],
    });
    const rowB = csv.split('\r\n')[2];
    expect(rowB).toContain('failed,,,,,'); // status from the stop, no event data
  });
});

describe('buildEventsJson()', () => {
  it('is pretty-printed, chronological and self-describing', () => {
    const events: DeliveryEvent[] = [
      event({ id: '2', at: '2024-05-05T09:30:00.000Z', stopId: 'B', type: 'failed', reason: 'Damaged' }),
      event({ id: '1', at: '2024-05-05T09:00:00.000Z', stopId: 'A', type: 'delivered', method: 'handed' }),
    ];
    const json = JSON.parse(buildEventsJson({ driver, route, events })) as {
      exportedAt: string;
      driver: { id: string };
      route: { stopIds: string[]; plannedMinutes: number };
      summary: { delivered: number };
      events: DeliveryEvent[];
    };
    expect(json.driver.id).toBe('D1');
    expect(json.route.stopIds).toEqual(['A', 'B', 'C']);
    expect(json.route.plannedMinutes).toBe(95);
    expect(json.summary.delivered).toBe(1);
    expect(json.events.map((e) => e.id)).toEqual(['1', '2']);
    expect(json.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('methodLabel()', () => {
  it('maps the four methods and tolerates undefined', () => {
    expect(methodLabel('handed')).toBe('Handed to recipient');
    expect(methodLabel('desk')).toBe('Front desk / mailroom');
    expect(methodLabel(undefined)).toBe('');
  });
});

describe('photo helpers', () => {
  it('fitWithin() scales the longest side down, never up, and keeps integers', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 320, height: 240 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 240, height: 320 });
    expect(fitWithin(100, 50)).toEqual({ width: 100, height: 50 }); // no upscale
    expect(fitWithin(MAX_THUMB_PX, MAX_THUMB_PX)).toEqual({ width: 320, height: 320 });
    expect(fitWithin(1000, 1, 320)).toEqual({ width: 320, height: 1 }); // never 0
    expect(fitWithin(0, 0)).toEqual({ width: 1, height: 1 });
    // Fractional sizes (rare, but `ImageBitmap` may report them) are rounded
    // before scaling, so 480.6 -> 481 -> 240.5 -> 241.
    expect(fitWithin(640.4, 480.6, 320)).toEqual({ width: 320, height: 241 });
  });

  it('storedPhotoBytes() measures the data URL itself — the store’s budget unit', () => {
    // The delivery sheet shows this number and the store budgets with it
    // (`PHOTO_BUDGET_BYTES` vs `photo.length`), so the two can never disagree.
    const url = `data:image/jpeg;base64,${'A'.repeat(40000)}`;
    expect(storedPhotoBytes(url)).toBe(url.length);
    expect(storedPhotoBytes(undefined)).toBe(0);
    // ~1.34x the decoded size: the reason showing the decoded one was confusing.
    expect(storedPhotoBytes(url)).toBeGreaterThan(dataUrlBytes(url));
  });

  it('dataUrlBytes() decodes the base64 payload size', () => {
    expect(dataUrlBytes(undefined)).toBe(0);
    expect(dataUrlBytes('')).toBe(0);
    expect(dataUrlBytes('not a data url')).toBe(0);
    expect(dataUrlBytes('data:image/jpeg,raw')).toBe(0); // not base64
    expect(dataUrlBytes('data:image/jpeg;base64,')).toBe(0);
    expect(dataUrlBytes('data:image/jpeg;base64,AAAA')).toBe(3);
    expect(dataUrlBytes('data:image/jpeg;base64,AAA=')).toBe(2);
    expect(dataUrlBytes('data:image/jpeg;base64,AA==')).toBe(1);
    // ~40 KB thumbnail budget in decoded bytes.
    expect(dataUrlBytes(`data:image/jpeg;base64,${'A'.repeat(40000)}`)).toBe(30000);
  });
});
