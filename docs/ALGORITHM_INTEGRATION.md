# Plugging a production algorithm into RouteIQ

RouteIQ ships with a placeholder optimizer (`nn-2opt-v1`: angle-seeded k-means → nearest-neighbour → 2-opt → time-window repair). It exists so the UI has something real to render; it is **not** the product. This document describes the contract a replacement must honour, where to swap it in, and what the UI assumes.

TL;DR: keep `OptimizeRequest → OptimizeResponse` (`src/lib/types.ts`), keep the invariants in [§4](#4-invariants-your-algorithm-must-keep), stay under ~2 s on Vercel, and set `algorithm` to your version string.

---

## 1. The contract, field by field

All types live in [`src/lib/types.ts`](../src/lib/types.ts). Times are `"HH:MM"` 24-hour strings, distances are kilometres, durations are minutes.

### 1.1 `OptimizeRequest` (input)

| Field | Type | Notes |
| --- | --- | --- |
| `depot` | `Depot` | Single start/end point. `id` is always the literal `"DEPOT"`; `lat`/`lng` in decimal degrees. |
| `drivers` | `Driver[]` | Order matters: **`routes` must come back in this order.** |
| `stops` | `Stop[]` | Every stop to plan today. Order is arbitrary but is what the baseline uses. |
| `options` | `OptimizeOptions?` | May be missing entirely; every field is optional. |

`Driver`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `string` | Stable id, e.g. `"D1"`. Used as the key in `stopsPerDriver` and `Route.driverId`. |
| `name`, `vehicle`, `color` | `string` | Display only. Pass through untouched. |
| `shiftStart` | `"HH:MM"` | The clock starts here for that driver's ETAs. |
| `capacityPackages` | `number` | Hard cap on `sum(stop.packages)` for that driver's route. |

`Stop`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `string` | Stable id, e.g. `"S017"`. |
| `address`, `recipient`, `notes` | `string` | Display only. |
| `lat`, `lng` | `number` | Decimal degrees. |
| `packages` | `number` | Counts against `capacityPackages`. |
| `priority` | `'standard' \| 'priority' \| 'overnight'` | Display / soft signal. The placeholder ignores it; a production algorithm may sequence `overnight` first, etc. |
| `timeWindow` | `{ start, end }?` | Optional delivery window. Arriving **before** `start` = the driver waits (ETA is clamped to `start`, not a violation). Arriving **after** `end` = a violation. |
| `serviceMinutes` | `number` | Time spent at the door. Departure = arrival + service. |
| `status` | `'pending' \| 'delivered' \| 'failed'` | Live delivery state. **Must not influence assignment** – the dispatcher may re-optimize mid-day and expects delivered stops to stay put in their route. |
| `deliveredAt` | `string?` | ISO timestamp, display only. |

`OptimizeOptions` (all optional)

| Field | Default | Meaning |
| --- | --- | --- |
| `respectTimeWindows` | `true` | When `false`, windows are ignored for planning (metrics still count violations). |
| `balanceLoad` | `true` | When `true`, stop counts per driver should differ by at most 3. |
| `avgSpeedKmh` | `32` | Used to turn distance into drive minutes: `minutes = km / avgSpeedKmh × 60 × 1.3` (1.3 = road factor over straight-line distance). |

### 1.2 `OptimizeResponse` (output)

| Field | Type | Meaning |
| --- | --- | --- |
| `routes` | `Route[]` | **One per driver, in `drivers` order**, including drivers with no stops. |
| `unassignedStopIds` | `string[]` | Stops that could not be placed (capacity, infeasible windows…). Shown as grey markers with an “Unassigned” chip. |
| `metrics` | `RouteMetrics` | Aggregates shown in the comparison card. |
| `algorithm` | `string` | Your version string, e.g. `"or-tools-cvrptw-2026.03"`. Surfaced in the toast and `/api/health`. |
| `computeMs` | `number` | Wall-clock time of the optimisation, in ms. Surfaced in the toast. |

`Route`

| Field | Type | Meaning |
| --- | --- | --- |
| `driverId` | `string` | Matches `Driver.id`. |
| `stopIds` | `string[]` | Ordered visit sequence, **excluding** the depot. `[]` for an idle driver. |
| `legs` | `RouteLeg[]` | Closed chain `DEPOT → stopIds[0] → … → stopIds[n-1] → DEPOT`, i.e. `stopIds.length + 1` legs, or `[]` when there are no stops. |
| `totalDistanceKm` | `number` | Sum of leg distances, 2 decimals. |
| `totalMinutes` | `number` | Depot-to-depot duration = drive + service + waiting, integer. |
| `etaByStopId` | `Record<string, "HH:MM">` | Arrival time for **every** id in `stopIds` (after any wait). |

`RouteLeg`

| Field | Type | Meaning |
| --- | --- | --- |
| `fromId`, `toId` | `string` | Stop id or `"DEPOT"`. |
| `distanceKm` | `number` | 2 decimals. |
| `driveMinutes` | `number` | Integer. |
| `path` | `[lat, lng][]?` | Optional road geometry. If absent the map draws a straight line. A production algorithm with a real router can fill this in and the map will follow it. |

`RouteMetrics`

| Field | Meaning |
| --- | --- |
| `totalDistanceKm` | Sum of `Route.totalDistanceKm`. |
| `totalMinutes` | Sum of `Route.totalMinutes`. |
| `stopsPerDriver` | `{ [driverId]: stopIds.length }` for every driver. |
| `longestRouteMinutes` | `max(Route.totalMinutes)` (0 with no routes). |
| `timeWindowViolations` | Number of assigned stops whose ETA is strictly after `timeWindow.end`. |

`computeMetrics(routes, stops)` in `src/lib/optimizer/schedule.ts` derives all of these from routes alone; you can call it instead of computing metrics yourself.

---

## 2. Full example

### Request (2 drivers, 3 stops)

```json
{
  "depot": {
    "id": "DEPOT",
    "name": "Madison East Station",
    "address": "4001 Anderson St, Madison, WI 53704",
    "lat": 43.1214,
    "lng": -89.3305
  },
  "drivers": [
    { "id": "D1", "name": "Maya Thompson", "vehicle": "Van 12", "color": "#2563eb", "shiftStart": "08:00", "capacityPackages": 60 },
    { "id": "D2", "name": "Luis Ortega",   "vehicle": "Van 07", "color": "#f97316", "shiftStart": "08:30", "capacityPackages": 60 }
  ],
  "stops": [
    {
      "id": "S001", "address": "1 S Pinckney St, Madison, WI 53703", "lat": 43.0745, "lng": -89.3818,
      "recipient": "Harold Bennett", "packages": 2, "priority": "priority",
      "timeWindow": { "start": "09:00", "end": "11:00" }, "serviceMinutes": 4, "status": "pending",
      "notes": "Use loading dock on Main St."
    },
    {
      "id": "S002", "address": "120 King St, Madison, WI 53703", "lat": 43.0735, "lng": -89.3805,
      "recipient": "Ines Marchetti", "packages": 1, "priority": "standard", "serviceMinutes": 3, "status": "pending"
    },
    {
      "id": "S003", "address": "2500 Winnebago St, Madison, WI 53704", "lat": 43.0985, "lng": -89.3455,
      "recipient": "Devon Clarke", "packages": 3, "priority": "overnight", "serviceMinutes": 5, "status": "pending"
    }
  ],
  "options": { "respectTimeWindows": true, "balanceLoad": true, "avgSpeedKmh": 32 }
}
```

### Response (as produced by `nn-2opt-v1`)

```json
{
  "routes": [
    {
      "driverId": "D1",
      "stopIds": ["S003"],
      "legs": [
        { "fromId": "DEPOT", "toId": "S003", "distanceKm": 2.82, "driveMinutes": 7 },
        { "fromId": "S003", "toId": "DEPOT", "distanceKm": 2.82, "driveMinutes": 7 }
      ],
      "totalDistanceKm": 5.65,
      "totalMinutes": 19,
      "etaByStopId": { "S003": "08:07" }
    },
    {
      "driverId": "D2",
      "stopIds": ["S001", "S002"],
      "legs": [
        { "fromId": "DEPOT", "toId": "S001", "distanceKm": 6.67, "driveMinutes": 16 },
        { "fromId": "S001", "toId": "S002", "distanceKm": 0.15, "driveMinutes": 0 },
        { "fromId": "S002", "toId": "DEPOT", "distanceKm": 6.7, "driveMinutes": 16 }
      ],
      "totalDistanceKm": 13.52,
      "totalMinutes": 54,
      "etaByStopId": { "S001": "09:00", "S002": "09:04" }
    }
  ],
  "unassignedStopIds": [],
  "metrics": {
    "totalDistanceKm": 19.17,
    "totalMinutes": 73,
    "stopsPerDriver": { "D1": 1, "D2": 2 },
    "longestRouteMinutes": 54,
    "timeWindowViolations": 0
  },
  "algorithm": "nn-2opt-v1",
  "computeMs": 10.9
}
```

Things to notice: D2 leaves at 08:30, would reach S001 at 08:46, but the window opens at 09:00, so the ETA is clamped to `09:00` and the wait is included in `totalMinutes` (54 ≈ 30 min from 08:30 until the window opens, 4 min service, a 150 m hop, 3 min service, 16 min back to the depot). `driveMinutes` of `0` for a 150 m hop is just integer rounding; the underlying totals use unrounded values.

---

## 3. Where to swap

There are two seams. Pick one; the UI does not care which.

### 3.1 Option A – replace `optimize()` in TypeScript

`src/lib/optimizer/index.ts`:

```ts
export const ALGORITHM = 'my-solver-v1';

export function optimize(req: OptimizeRequest): OptimizeResponse {
  const t0 = performance.now();
  // ... your algorithm: produce `assignments: Record<driverId, orderedStopIds[]>`
  //     and `unassignedStopIds`
  const { routes, metrics } = schedule({ depot: req.depot, drivers: req.drivers, stops: req.stops, assignments, options: req.options });
  return { routes, unassignedStopIds, metrics, algorithm: ALGORITHM, computeMs: performance.now() - t0 };
}
```

Reusing `schedule()` is the easiest way to guarantee valid legs/ETAs/metrics; if you have your own travel-time model you can build `Route` objects yourself and call `computeMetrics(routes, stops)`.

Keep the module free of side effects and Node-only imports if you want the store's offline fallback (it imports `optimize()` directly in the browser when `/api/optimize` is unreachable). If your solver is server-only, leave `optimize()` as the fallback and go with Option B.

### 3.2 Option B – proxy `/api/optimize` to a Python function

Vercel runs Python files under `api/` (repository root, **not** `src/app/api`) as serverless functions. Create `api/optimize_py.py`:

```python
# api/optimize_py.py  -> deployed at /api/optimize_py
import json
import time
from http.server import BaseHTTPRequestHandler


def solve(req: dict) -> dict:
    """Return an OptimizeResponse-shaped dict. Replace with the real solver."""
    t0 = time.perf_counter()
    drivers = req["drivers"]
    stops = req["stops"]
    # ... your algorithm here. Below: trivial round-robin so the skeleton runs.
    assignments = {d["id"]: [] for d in drivers}
    for i, s in enumerate(stops):
        assignments[drivers[i % len(drivers)]["id"]].append(s["id"])
    routes = [
        {
            "driverId": d["id"],
            "stopIds": assignments[d["id"]],
            "legs": [],            # fill in DEPOT -> ... -> DEPOT
            "totalDistanceKm": 0,  # fill in
            "totalMinutes": 0,     # fill in
            "etaByStopId": {},     # fill in for every stop id
        }
        for d in drivers
    ]
    return {
        "routes": routes,
        "unassignedStopIds": [],
        "metrics": {
            "totalDistanceKm": 0,
            "totalMinutes": 0,
            "stopsPerDriver": {d["id"]: len(assignments[d["id"]]) for d in drivers},
            "longestRouteMinutes": 0,
            "timeWindowViolations": 0,
        },
        "algorithm": "python-solver-v1",
        "computeMs": round((time.perf_counter() - t0) * 1000, 1),
    }


class handler(BaseHTTPRequestHandler):  # Vercel looks for a class named `handler`
    def do_POST(self):
        length = int(self.headers.get("content-length", 0))
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
            result = solve(body)
            status = 200
        except Exception as exc:  # never leak a traceback to the client
            result = {"error": f"Optimizer failed: {exc}", "issues": []}
            status = 500
        payload = json.dumps(result).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
```

Then have the Next route forward the **validated** body and pass the response through unchanged. In `src/app/api/optimize/route.ts`, keep the zod validation and replace the `optimize(req)` call with:

```ts
const origin = new URL(request.url).origin; // same deployment
const upstream = await fetch(`${origin}/api/optimize_py`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(req),
  signal: AbortSignal.timeout(8_000),
});
if (!upstream.ok) {
  return NextResponse.json({ error: `Solver returned ${upstream.status}`, issues: [] }, { status: 502 });
}
const result = (await upstream.json()) as OptimizeResponse;
return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
```

Optionally validate the upstream JSON against the invariants below before returning it, and fall back to the TypeScript `optimize()` when the Python function is unavailable so the demo never goes blank.

Add a `requirements.txt` at the repository root for any Python dependencies (e.g. `ortools`), and note that Python functions have their own cold start (~1–3 s for heavy wheels) – see the budget below.

---

## 4. Invariants your algorithm must keep

The UI and store rely on these; the test-suite in `tests/optimizer.test.ts` checks every one of them for the placeholder.

1. **Every stop appears exactly once** – either in exactly one `routes[i].stopIds` or in `unassignedStopIds`. Never dropped, never duplicated.
2. **`routes` has one entry per driver, in `drivers` order**, including empty routes (`stopIds: []`, `legs: []`, totals `0`, `etaByStopId: {}`).
3. **Legs form a closed depot chain**: `legs[0].fromId === "DEPOT"`, `legs[k].toId === legs[k+1].fromId`, the middle ids equal `stopIds` in order, and the last leg ends at `"DEPOT"`. `legs.length === stopIds.length + 1` (or `0`).
4. **`etaByStopId` has an `"HH:MM"` entry for every id in `stopIds`**, non-decreasing along the route.
5. **Time-window semantics**: early arrival = wait (ETA clamped to `start`, not a violation); ETA strictly after `end` = violation. `metrics.timeWindowViolations` counts those.
6. **Metrics are consistent with routes**: `totalDistanceKm ≈ Σ route.totalDistanceKm` (±0.05), `totalMinutes = Σ route.totalMinutes`, `stopsPerDriver` has every driver id, `longestRouteMinutes = max`. Easiest: call `computeMetrics(routes, stops)`.
7. **Capacity**: `Σ packages` on a route ≤ `driver.capacityPackages`. Stops that cannot fit go to `unassignedStopIds`.
8. **Balance** (when `balanceLoad !== false`): stop counts differ by ≤ 3 across drivers, capacity permitting.
9. **Assignment ignores `status`**: re-optimising with some stops delivered must not shuffle stops between drivers because of it.
10. **Deterministic preferred**: same input → same output. If your solver is stochastic, seed it from the input (e.g. hash of stop ids) so a demo run is reproducible and “Reset demo” gives the same picture every time.
11. **Rounding**: `distanceKm`/`totalDistanceKm` to 2 decimals, minutes to integers, `computeMs` to at most 1 decimal.

---

## 5. Performance budget

`/api/optimize` runs as a Vercel serverless function (`runtime = 'nodejs'`). Budget the whole request at **≤ 2 s** including cold start so the “Optimize” button feels instant; the store shows a spinner and then a toast with `computeMs`. Guidelines:

- The placeholder solves 45 stops / 3 drivers in single-digit milliseconds. Anything under ~500 ms of solve time is invisible to the user.
- If a metaheuristic needs a time limit, cap it around 1 s and return the best-so-far solution – never block for the full function timeout.
- For Python (Option B): budget cold start of the runtime + import time of your solver. Keep the wheel small, import lazily inside `solve()`, and consider `maxDuration` in `vercel.json` only as a safety net, not a target.
- The client falls back to the in-browser TypeScript `optimize()` when the API call fails, so a timeout degrades gracefully but silently swaps algorithms – watch `algorithm` in the toast during testing.

---

## 6. What the UI does after you return

- The store keeps `routes`, `metrics`, `algorithm`, `computeMs`. It also runs `baseline()` (round-robin, `baseline-round-robin-v1`) locally to render the “before/after” comparison card; you do not need to provide a baseline.
- **Manual reassignment (drag a stop to another driver in the dispatch list, or “Reassign to…” in a map popup) does not call your algorithm.** The store rewrites `assignments` and re-runs `schedule()` from `src/lib/optimizer/schedule.ts` to recompute legs, ETAs, totals and metrics. It never re-sequences: the moved stop is inserted at the chosen index (default: end of the target route). Only the “Optimize” button (and `resetDemo` → `optimize`) calls `/api/optimize`.
- Marking stops delivered/failed updates `stop.status` locally and never triggers a re-optimise.
- Legs without `path` are drawn as straight lines. If your solver returns real road geometry in `RouteLeg.path` (as `[lat, lng]` pairs) the map follows it, no UI change required.

---

## 7. Checklist for a new algorithm

- [ ] `algorithm` string bumped; `/api/health` reports it.
- [ ] `pnpm test` still green (the invariants above are enforced on the seed).
- [ ] Runs under 2 s on the seed from a cold start.
- [ ] Deterministic on the seed (or seeded from input).
- [ ] Optional: fills `RouteLeg.path` if you have a router.
