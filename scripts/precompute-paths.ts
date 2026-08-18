/**
 * One-off script: precompute road-following polylines between every pair of
 * seed points (depot + 45 stops) using the public OSRM demo server, and store
 * them in `src/data/paths.json` so the map can draw realistic route legs.
 *
 *   pnpm precompute-paths
 *
 * The app NEVER calls OSRM at runtime — this file is the only place that talks
 * to it, and its output is committed. If the file is missing or a pair is not
 * present, the map falls back to straight lines (see src/data/paths.ts).
 *
 * Output format (kept small on purpose — polylines are Google-encoded strings,
 * ~60 bytes per pair, and stored once per unordered pair):
 * {
 *   "generatedAt": "2026-08-17T...",
 *   "source": "OSRM demo server (router.project-osrm.org), driving profile",
 *   "ids": ["DEPOT", "S001", ...],
 *   "paths": { "DEPOT|S001": "<encoded polyline>", ... }   // key = sorted ids joined by "|"
 * }
 *
 * Be polite to the demo server: sequential-ish requests with a small
 * concurrency, a User-Agent, and retries with backoff.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Pt = { id: string; lat: number; lng: number };

const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const CONCURRENCY = 3;
const DELAY_MS = 120;
const UA = 'RouteIQ-demo-precompute/1.0 (one-off script; contact: repo owner)';

const root = resolve(__dirname, '..');
const depot = JSON.parse(readFileSync(resolve(root, 'src/data/depot.json'), 'utf8')) as Pt;
const stops = JSON.parse(readFileSync(resolve(root, 'src/data/stops.json'), 'utf8')) as Pt[];
const outFile = resolve(root, 'src/data/paths.json');

const points: Pt[] = [{ id: depot.id, lat: depot.lat, lng: depot.lng }, ...stops];

// Resume support: keep whatever was already fetched.
let existing: Record<string, string> = {};
try {
  const prev = JSON.parse(readFileSync(outFile, 'utf8')) as { paths?: Record<string, string> };
  existing = prev.paths ?? {};
} catch {
  /* no previous file */
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const pairs: [Pt, Pt][] = [];
for (let i = 0; i < points.length; i++) {
  for (let j = i + 1; j < points.length; j++) {
    pairs.push([points[i], points[j]]);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPath(a: Pt, b: Pt, attempt = 0): Promise<string | null> {
  const url = `${OSRM}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=simplified&geometries=polyline&steps=false`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) {
      console.warn(`  ! ${a.id}->${b.id}: HTTP ${res.status} (skipping)`);
      return null;
    }
    const json = (await res.json()) as { code: string; routes?: { geometry: string }[] };
    if (json.code !== 'Ok' || !json.routes?.[0]) {
      console.warn(`  ! ${a.id}->${b.id}: ${json.code}`);
      return null;
    }
    return json.routes[0].geometry;
  } catch (err) {
    if (attempt < 4) {
      const backoff = 1000 * 2 ** attempt;
      console.warn(`  ~ ${a.id}->${b.id}: ${(err as Error).message}; retry in ${backoff}ms`);
      await sleep(backoff);
      return fetchPath(a, b, attempt + 1);
    }
    console.warn(`  ! ${a.id}->${b.id}: giving up (${(err as Error).message})`);
    return null;
  }
}

async function main() {
  const paths: Record<string, string> = { ...existing };
  const todo = pairs.filter(([a, b]) => !paths[pairKey(a.id, b.id)]);
  console.log(`${points.length} points, ${pairs.length} pairs, ${todo.length} to fetch`);

  let done = 0;
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < todo.length) {
      const [a, b] = todo[cursor++];
      const geom = await fetchPath(a, b);
      if (geom) paths[pairKey(a.id, b.id)] = geom;
      done++;
      if (done % 50 === 0 || done === todo.length) {
        console.log(`  ${done}/${todo.length}`);
        writeOut(paths); // checkpoint
      }
      await sleep(DELAY_MS);
    }
  });
  await Promise.all(workers);
  writeOut(paths);
  const missing = pairs.filter(([a, b]) => !paths[pairKey(a.id, b.id)]).length;
  console.log(`done. ${Object.keys(paths).length} paths written, ${missing} missing -> ${outFile}`);
}

function writeOut(paths: Record<string, string>) {
  const out = {
    generatedAt: new Date().toISOString(),
    source: 'OSRM demo server (router.project-osrm.org), driving profile, simplified geometry',
    ids: points.map((p) => p.id),
    paths,
  };
  writeFileSync(outFile, JSON.stringify(out) + '\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
