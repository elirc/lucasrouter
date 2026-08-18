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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

const timeWindowSchema = z.object({ start: hhmm, end: hhmm });

const stopSchema = z.object({
  id: z.string().min(1),
  address: z.string(),
  lat: latitude,
  lng: longitude,
  recipient: z.string(),
  packages: z.number().int().nonnegative(),
  priority: z.enum(['standard', 'priority', 'overnight']),
  timeWindow: timeWindowSchema.optional(),
  serviceMinutes: z.number().nonnegative(),
  status: z.enum(['pending', 'delivered', 'failed']),
  notes: z.string().optional(),
  deliveredAt: z.string().optional(),
});

const driverSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  vehicle: z.string(),
  color: z.string(),
  shiftStart: hhmm,
  capacityPackages: z.number().nonnegative(),
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
  avgSpeedKmh: z.number().positive().optional(),
});

const optimizeRequestSchema = z.object({
  depot: depotSchema,
  drivers: z.array(driverSchema),
  stops: z.array(stopSchema),
  options: optionsSchema.optional(),
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
