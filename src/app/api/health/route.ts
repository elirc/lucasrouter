// GET /api/health - liveness probe + which optimizer version is deployed.

import { NextResponse } from 'next/server';
import { ALGORITHM } from '@/lib/optimizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Bumped by hand when the API contract or optimizer changes. */
const API_VERSION = '1.0.0';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, algorithm: ALGORITHM, version: API_VERSION });
}
