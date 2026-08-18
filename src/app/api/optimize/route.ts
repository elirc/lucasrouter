// POST /api/optimize - validate an `OptimizeRequest` and run the optimizer.
//
// This is the seam for a production algorithm: keep the validation, then either
// call a different `optimize()` implementation or `fetch()` a Python function
// (see docs/ALGORITHM_INTEGRATION.md). The response shape must stay
// `OptimizeResponse` so the UI keeps working unchanged.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { OptimizeRequest } from '@/lib/types';
import { optimize } from '@/lib/optimizer';
import { MAX_SPEED_KMH, MIN_SPEED_KMH } from '@/lib/optimizer/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * Serverless time limit (seconds). The optimizer bounds its own repair stage
 * (see `REPAIR_TIME_BUDGET_MS`), so a max-size request finishes in a few
 * seconds; this is a backstop, not the budget.
 */
export const maxDuration = 30;

// ---------------------------------------------------------------------------
// Schema (mirrors src/lib/types.ts). Unknown keys are accepted and stripped.
// ---------------------------------------------------------------------------

const hhmm = z
  .string()
  .regex(/^\d{1,2}:\d{2}$/, 'Expected "HH:MM"')
  .refine(
    (v) => {
      const [h, m] = v.split(':').map(Number);
      return h >= 0 && h <= 23 && m >= 0 && m <= 59;
    },
    { message: 'Hour must be 0-23 and minute 0-59' },
  );

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

const toMinutes = (v: string): number => {
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
};

const timeWindowSchema = z
  .object({ start: hhmm, end: hhmm })
  .refine((w) => toMinutes(w.end) >= toMinutes(w.start), {
    message: 'Time window end must not be before its start',
    path: ['end'],
  });

/** CSS hex colour: #rgb, #rgba, #rrggbb or #rrggbbaa (what the UI's contrast helper understands). */
const hexColor = z.string().regex(/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Expected a hex colour like #2563eb');

/**
 * Request size caps. The placeholder optimizer builds a dense n x n matrix and
 * runs O(n^2)-O(n^3) local search per driver, and the endpoint is public, so a
 * request must not be able to allocate gigabytes or run for minutes. 1000 stops
 * / 50 drivers is far beyond the demo (45 / 3) and any single depot's day. (The
 * repair stage additionally has a wall-clock budget, see `REPAIR_TIME_BUDGET_MS`.)
 * (Not exported: Next only allows HTTP-method / segment-config exports here.)
 */
const MAX_STOPS = 1000;
const MAX_DRIVERS = 50;

/**
 * Sanity bounds on numeric fields. Without them a schema-valid request can
 * produce out-of-contract output (`NaN:NaN` ETAs, `totalMinutes: 1e308`).
 */
const MAX_PACKAGES_PER_STOP = 10_000;
const MAX_CAPACITY = 1_000_000;
const MAX_SERVICE_MINUTES = 24 * 60;

const stopSchema = z.object({
  // 'DEPOT' is reserved: RouteLeg.fromId / toId use it for the depot endpoints.
  id: z.string().min(1).refine((v) => v !== 'DEPOT', { message: "Stop id 'DEPOT' is reserved" }),
  address: z.string(),
  lat: latitude,
  lng: longitude,
  recipient: z.string(),
  packages: z.number().int().nonnegative().max(MAX_PACKAGES_PER_STOP),
  priority: z.enum(['standard', 'priority', 'overnight']),
  timeWindow: timeWindowSchema.optional(),
  serviceMinutes: z.number().nonnegative().max(MAX_SERVICE_MINUTES),
  status: z.enum(['pending', 'delivered', 'failed']),
  notes: z.string().optional(),
  deliveredAt: z.string().optional(),
});

const driverSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  vehicle: z.string(),
  color: hexColor,
  shiftStart: hhmm,
  capacityPackages: z.number().nonnegative().max(MAX_CAPACITY),
});

const depotSchema = z.object({
  id: z.literal('DEPOT'),
  name: z.string(),
  address: z.string(),
  lat: latitude,
  lng: longitude,
});

const optionsSchema = z.object({
  respectTimeWindows: z.boolean().optional(),
  balanceLoad: z.boolean().optional(),
  avgSpeedKmh: z.number().min(MIN_SPEED_KMH).max(MAX_SPEED_KMH).optional(),
});

/** Ids that occur more than once, in first-seen order (for error messages). */
function duplicateIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

const optimizeRequestSchema = z
  .object({
    depot: depotSchema,
    drivers: z.array(driverSchema).max(MAX_DRIVERS, `At most ${MAX_DRIVERS} drivers per request`),
    stops: z.array(stopSchema).max(MAX_STOPS, `At most ${MAX_STOPS} stops per request`),
    options: optionsSchema.optional(),
  })
  // Ids must be unique: the optimizer's "every stop exactly once" invariant and
  // the UI's id-keyed lookups (etaByStopId, stops-by-id) both assume it, and a
  // duplicate would otherwise be silently dropped or planned twice.
  .superRefine((req, ctx) => {
    const dupStops = duplicateIds(req.stops.map((s) => s.id));
    if (dupStops.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['stops'],
        message: `Duplicate stop ids: ${dupStops.slice(0, 5).join(', ')}${dupStops.length > 5 ? ', ...' : ''}`,
      });
    }
    const dupDrivers = duplicateIds(req.drivers.map((d) => d.id));
    if (dupDrivers.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['drivers'],
        message: `Duplicate driver ids: ${dupDrivers.slice(0, 5).join(', ')}${dupDrivers.length > 5 ? ', ...' : ''}`,
      });
    }
  });

/** Compact issue shape returned to clients on 400. */
interface ApiIssue {
  path: string;
  message: string;
}

function toIssues(error: z.ZodError): ApiIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }));
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON', issues: [] satisfies ApiIssue[] },
      { status: 400 },
    );
  }

  const parsed = optimizeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid OptimizeRequest', issues: toIssues(parsed.error) },
      { status: 400 },
    );
  }

  // The zod output is structurally identical to OptimizeRequest.
  const req: OptimizeRequest = parsed.data;

  try {
    const result = optimize(req);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    // Should not happen for validated input, but never leak a stack trace.
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Optimizer failed: ${message}`, issues: [] }, { status: 500 });
  }
}
