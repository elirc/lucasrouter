# Plugging a production algorithm into RouteIQ

RouteIQ ships with a placeholder optimizer (`nn-2opt-v1`: angle-seeded k-means → nearest-neighbour → 2-opt → time-window repair). It exists so the UI has something real to render; it is **not** the product. This document describes the contract a replacement must honour, where to swap it in, and what the UI assumes.

TL;DR: keep `OptimizeRequest → OptimizeResponse` (`src/lib/types.ts`), keep the invariants in [§4](#4-invariants-your-algorithm-must-keep), stay under ~2 s on Vercel, respect the request limits in [§1.3](#13-request-limits-enforced-by-apioptimize), and set `algorithm` to your version string.

---

## 1. The contract, field by field

All types live in [`src/lib/types.ts`](../src/lib/types.ts). Times are `"HH:MM"` 24-hour strings, distances are kilometres, durations are minutes.

**Distance model of the placeholder.** RouteIQ has no road network at runtime, so every kilometre it plans with *and reports* (`RouteLeg.distanceKm`, `Route.totalDistanceKm`, `RouteMetrics.totalDistanceKm`) is an **estimated road km = great-circle (haversine) km × 1.3**, and drive time is `roadKm / avgSpeedKmh × 60`. A production algorithm with a real router should report its real road km / minutes in the same fields; the UI just displays them (see [§6](#6-what-the-ui-does-after-you-return) for how that affects the before/after card).

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
| `respectTimeWindows` | `true` | When `false`, the placeholder's **sequencing stage does not repair late arrivals** (the time-window repair pass in `optimize()` is skipped). ETAs are still computed with the same rules — a driver arriving early still waits for the window to open — and `metrics.timeWindowViolations` still counts late arrivals. |
| `balanceLoad` | `true` | When `true`, stop counts per driver should differ by at most 3. |
| `avgSpeedKmh` | `32` | Used to turn distance into drive minutes: `minutes = roadKm / avgSpeedKmh × 60`, where `roadKm` is the estimated road distance (haversine × 1.3, see the note above). |

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
| `totalDistanceKm` | `number` | Sum of leg distances (estimated road km), 2 decimals. |
| `totalMinutes` | `number` | Depot-to-depot duration = drive + service + waiting, integer. |
| `etaByStopId` | `Record<string, "HH:MM">` | Arrival time for **every** id in `stopIds` (after any wait). |

`RouteLeg`

| Field | Type | Meaning |
| --- | --- | --- |
| `fromId`, `toId` | `string` | Stop id or `"DEPOT"`. |
| `distanceKm` | `number` | Estimated road km (haversine × 1.3 in the placeholder; real road km if you have a router), 2 decimals. |
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

### 1.3 Request limits (enforced by `/api/optimize`)

The route handler validates the body with zod **before** any algorithm runs and answers `400 { error: "Invalid OptimizeRequest", issues: [{ path, message }] }` when:

| Rule | Issue `path` | Why |
| --- | --- | --- |
| more than **1000 stops** | `stops` | the endpoint is public and the placeholder is O(n²)–O(n³); a request must not be able to allocate gigabytes or run for minutes |
| more than **50 drivers** | `drivers` | same |
| **duplicate stop ids** (`"Duplicate stop ids: S001, …"`) | `stops` | the "every stop exactly once" invariant and every id-keyed lookup in the UI assume unique ids |
| **duplicate driver ids** | `drivers` | `stopsPerDriver` / `Route.driverId` are keyed by driver id |
| a stop whose id is the literal **`"DEPOT"`** | `stops.<i>.id` | reserved for `RouteLeg.fromId` / `toId` |
| any field-level problem (bad `"HH:MM"`, latitude out of range, negative packages, unknown enum value, …) | the field path, e.g. `stops.3.timeWindow.start` | shape mirrors `src/lib/types.ts` |

Unknown keys are stripped rather than rejected. Malformed JSON → `400 { error: "Request body must be valid JSON", issues: [] }`; an exception thrown by the optimizer → `500`. If your solver needs different limits, change `MAX_STOPS` / `MAX_DRIVERS` in `src/app/api/optimize/route.ts` (and mind the ~2 s budget in [§5](#5-performance-budget)).

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
        { "fromId": "DEPOT", "toId": "S003", "distanceKm": 3.67, "driveMinutes": 7 },
        { "fromId": "S003", "toId": "DEPOT", "distanceKm": 3.67, "driveMinutes": 7 }
      ],
      "totalDistanceKm": 7.34,
      "totalMinutes": 19,
      "etaByStopId": { "S003": "08:07" }
    },
    {
      "driverId": "D2",
      "stopIds": ["S002", "S001"],
      "legs": [
        { "fromId": "DEPOT", "toId": "S002", "distanceKm": 8.71, "driveMinutes": 16 },
        { "fromId": "S002", "toId": "S001", "distanceKm": 0.2, "driveMinutes": 0 },
        { "fromId": "S001", "toId": "DEPOT", "distanceKm": 8.68, "driveMinutes": 16 }
      ],
      "totalDistanceKm": 17.58,
      "totalMinutes": 50,
      "etaByStopId": { "S002": "08:46", "S001": "09:00" }
    }
  ],
  "unassignedStopIds": [],
  "metrics": {
    "totalDistanceKm": 24.92,
    "totalMinutes": 69,
    "stopsPerDriver": { "D1": 1, "D2": 2 },
    "longestRouteMinutes": 50,
    "timeWindowViolations": 0
  },
  "algorithm": "nn-2opt-v1",
  "computeMs": 24.7
}
```

(Produced by running `optimize()` on exactly the request above; `computeMs` is whatever the machine measured and will differ.)

Things to notice:

- All `distanceKm` values are **estimated road km** (haversine × 1.3): the depot → S003 hop is 2.82 km as the crow flies and is reported as 3.67 km.
- D2 leaves at 08:30 and reaches the downtown pair at 08:46. Pure nearest-neighbour would visit S001 first, but its window opens at 09:00, so the driver would idle 14 minutes and S002 would slip behind that wait; the time-window repair pass therefore serves S002 first (08:46, no window) and arrives at S001 at 08:49, where the ETA is clamped to `09:00` — an 11-minute **wait**, not a violation — and the wait is included in `totalMinutes` (50 = 16 drive + 3 service + 0 hop + 11 wait + 4 service + 16 back).
- `driveMinutes` of `0` for a 200 m hop is just integer rounding; the underlying totals use unrounded values.

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

For reference, the placeholder you are replacing does: (1) distance matrix (haversine × 1.3), (2) angle-seeded k-means assignment with capacity / balance rebalancing, (3) nearest-neighbour + 2-opt per driver, (4) a **time-window repair pass** that alternates a *late* pass (move a late stop earlier in its own route while violations strictly decrease) with an *idle* pass (while some stop waits for its window to open, relocate a single stop — either push the waiting stop later or pull a stop from behind the wait forward — accepting only moves that do not add violations and get the driver back to the depot earlier, or equally early with everyone served earlier), so idle time is pushed to the tail of the route instead of stranding no-window stops behind a closed window; skipped when `respectTimeWindows === false`, capped at 100 iterations per pass / 20 alternations, idle pass only for routes ≤ 120 stops; (5) `schedule()`. It is deterministic and pure (`src/lib/optimizer/`).

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

- The placeholder solves 45 stops / 3 drivers in a few tens of milliseconds (~25–90 ms measured; the idle-repair pass is the expensive part, plain NN + 2-opt is ~3 ms). Anything under ~500 ms of solve time is invisible to the user.
- If a metaheuristic needs a time limit, cap it around 1 s and return the best-so-far solution – never block for the full function timeout.
- For Python (Option B): budget cold start of the runtime + import time of your solver. Keep the wheel small, import lazily inside `solve()`, and consider `maxDuration` in `vercel.json` only as a safety net, not a target.
- The client falls back to the in-browser TypeScript `optimize()` when the API call fails, so a timeout degrades gracefully but silently swaps algorithms – watch `algorithm` in the toast during testing.

---

## 6. What the UI does after you return

- The store keeps `routes`, `metrics`, `algorithm`, `computeMs`. It also runs `baseline()` (round-robin, `baseline-round-robin-v1`) locally to render the “before/after” comparison card; you do not need to provide a baseline. The baseline is scheduled with the placeholder's distance model (estimated road km = haversine × 1.3, drive minutes = road km / `avgSpeedKmh` × 60). If your solver reports *real* road km / minutes, the card compares them against that ×1.3 estimate — roughly like-for-like, but not exact; if you want an exact comparison, run the baseline assignments through your own travel-time model too (`baseline()` returns them as `routes[i].stopIds`).
- **Who calls `/api/optimize`:** only the **Optimize / Re-optimize routes** button on `/dispatch` and the **“Optimize now (demo)”** button shown on an un-optimized `/driver/[id]`. **Reset demo does not re-optimize** — it reloads the seed and clears routes, metrics and statuses; the dispatcher presses Optimize again. Nothing else (no timer, no status change, no page load) triggers the algorithm.
- **Manual reassignment (drag a stop to another driver in the dispatch list, “⋯ → Move to …”, or “Reassign to…” in a map popup) does not call your algorithm.** The store rewrites `assignments` and re-runs `schedule()` from `src/lib/optimizer/schedule.ts` to recompute legs, ETAs, totals and metrics. It never re-sequences: the moved stop is inserted at the chosen index (default: end of the target route). This also works **before** any optimisation: the first manual move bootstraps an empty plan (every driver `[]`), so `routes` becomes non-null with a single assigned stop while `algorithm`, `lastOptimizedAt` and the baseline stay `null` — a solver-backed integration must not assume that `routes !== null` implies `/api/optimize` has run. `moveStop()` returns `false` (and the UI shows no toast) for a no-op or an unknown id.
- Marking stops delivered/failed updates `stop.status` locally and never triggers a re-optimise. Undoing a failed stop restores its original notes (the failure reason prefix is stripped).
- Legs without `path` are drawn as straight lines. If your solver returns real road geometry in `RouteLeg.path` (as `[lat, lng]` pairs) the map follows it, no UI change required.
- Persistence: the whole plan is stored in `localStorage` (`routeiq-v1`, blob version 1) and kept in sync between open tabs on the same device; a corrupt or unavailable storage never blocks the app (it starts from defaults). None of this touches your algorithm.

---

## 7. Checklist for a new algorithm

- [ ] `algorithm` string bumped; `/api/health` reports it.
- [ ] `pnpm verify` still green (typecheck + lint + tests; the invariants above are enforced on the seed in `tests/optimizer.test.ts`, the request limits in `tests/api-optimize.test.ts`).
- [ ] Runs under 2 s on the seed from a cold start.
- [ ] Deterministic on the seed (or seeded from input).
- [ ] Reported km / minutes documented: real road figures, or the estimate model of [§1](#1-the-contract-field-by-field) (the before/after card compares against the ×1.3-haversine baseline).
- [ ] Optional: fills `RouteLeg.path` if you have a router.
- [ ] Optional: `pnpm smoke` against `pnpm build && pnpm start` for the full UI walk-through.
