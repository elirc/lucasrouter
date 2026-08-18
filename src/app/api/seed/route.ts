// GET /api/seed - the demo dataset (depot, drivers, stops). The store calls this
// on first load and falls back to the bundled `getSeed()` if it fails, so the
// two are guaranteed to be identical.

import { NextResponse } from 'next/server';
import { getSeed } from '@/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(getSeed(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
