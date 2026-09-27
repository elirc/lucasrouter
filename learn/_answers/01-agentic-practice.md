# Agentic practice: rubrics and expected agent traps (sealed)

The technical reference answers already exist in `training/_answers/`. This file doesn't repeat them. It grades **your part**: the diagnosis,
the spec, and the review. Each drill is scored out of 10. 8 or more is a pass.

## Drill A · J3 body limits (reference: `training/_answers/ladder-J3.md`)
**Spec rubric (4)**
- Limit enforced both from `Content-Length` and by counting bytes while reading `request.body`, with the reader cancelled at the limit (2).
- Status codes stated: 413 too big, 415 wrong media type (charset parameter allowed), 400 unchanged for bad JSON and schema failures. No
  switch to 422, because it breaks the documented contract (1).
- You noted that the store treats **any** non-2xx as "optimize locally" (`optimize()` → `console.warn` + lazy local solver). So a 413 still
  gives the user a plan, computed on their main thread. That's graceful but slow at large N (1).
**Review rubric (6)**
- Caught (or confirmed absent) the **header-only check**: agents very often write `if (Number(content-length) > MAX) return 413` and call
  `request.json()` anyway. Without a streamed test (no header, 2.1 MB body) that passes, the limit is fake (3).
- Caught the 500 branch still echoing `err.message` (`Optimizer failed: ${message}` in the original), or confirmed it's now logged server-side only (1).
- Confirmed the existing tests in `tests/api-optimize.test.ts` weren't edited to fit the new code (1).
- Confirmed `docs/ALGORITHM_INTEGRATION.md` lists 413/415 (1).
**Common agent traps:** header-only limit; a `Content-Type` regex that rejects `application/json; charset=utf-8`; converting the whole route to
`request.text()` (still buffers everything before checking); adding a new error shape (`{ message }`).

## Drill B · INC-003 modality (reference: `training/_answers/incident-003.md`)
**Diagnosis rubric (3)**
- The loss table has at least: Escape → `cancel` event, the inert background, the top layer, and `aria-modal` now lying. Each row mapped to a driver report (2).
- You explained why the component's Tab-wrap `onKeyDown` doesn't cover switch access or a screen reader's virtual cursor: it only runs
  while focus is already inside the panel (1).
**Spec rubric (3)**
- `showModal()` restored as a hard requirement, and the probe `--only=sheet` result (`true/true/true`) is the acceptance check (1).
- The toast problem is solved **inside** the modal subtree (for example, portalling the toast into a host inside the open dialog), with the
  live region still always mounted (1).
- Forbidden: `show()`, z-index changes as the fix, closing the sheet to show the toast (1).
**Review rubric (4)**
- **The popover trap:** agents often propose `popover="manual"` + `showPopover()` for the toast. It paints above the modal, but content
  outside a modal dialog is **inert**, so the Undo button is visible and can't be clicked or focused. You catch this only by tabbing to Undo
  with a sheet open. Caught it, or verified the chosen design isn't affected (2).
- **The "keep show(), add an Escape handler" trap:** it fixes report D2 and leaves D3 (switch scanning) and TalkBack broken. It passes a naive
  Escape test. Rejected (1).
- You ran the probe yourself and did a keyboard pass on all three sheets (1).

## Drill C · INC-004 typing lag (reference: `training/_answers/incident-004.md`)
**Diagnosis rubric (4)**
- Named the cause as **where the subscription sits**: `useAppStore((s) => s.searchQuery)` in `DispatchScreen`, which re-renders the whole
  screen and passes a changing string to all 45 `StopMarker`s, so every marker memo misses (2).
- Explained why Event Timing shows almost no slow keydowns while the long-task time explodes: the render work runs in tasks that aren't
  the keydown event's own processing, so per-event durations under-report. You attributed it with a trace, not by guessing (1).
- Before/after numbers from one session, three runs each (1).
**Spec rubric (3)**
- No per-keystroke subscription in `DispatchScreen`. Only markers whose dimmed state flips re-render (a boolean prop, or a matching-id `Set`
  computed once) (1).
- The input stays urgent (local state + `useDeferredValue` for the map side, or a subscription inside a small map wrapper) (1).
- A guard: a Profiler render-count test, or a lint/review rule about `DispatchScreen` subscriptions (1).
**Review rubric (3)**
- **The memo trap:** agents love wrapping more components in `memo` or adding `useMemo` around `dimmed`. If `highlightQuery` (a new string
  every keystroke) is still a `StopMarker` prop, every memo still misses. Now it just costs a comparison too. Caught (1).
- **The debounce trap:** a 150 ms debounce on the store write "fixes" the probe numbers but still re-renders the tree once per pause and adds
  map latency. Acceptable only if your spec allowed it and you said so (1).
- You re-measured yourself and rejected any "significantly faster" claim without a number (1).

## Drill D · INC-001 landing bundle (reference: `training/_answers/incident-001.md`)
**Diagnosis rubric (4)**
- Explained why "total JS fetched" moved only +6 KB: on `main`, the landing page's `<Link href="/dispatch">` and `<Link href="/driver">` already
  **prefetch** a chunk with the store and seed at idle. The regression moved those bytes onto the hydration-critical path and made them
  **execute** (2).
- Named the modules (zustand + persist, the seed JSON, `baseline`/`schedule`) and the side effects now running on `/`: persist rehydration
  from `localStorage`, `installCrossTabSync()` (2).
**Spec rubric (3)**
- Acceptance is the **critical script list** of `/` from the build output, not total JS (1).
- The counter stays, without importing the store (for example, read `localStorage['routeiq-v1']` in an effect and parse only
  `state.stops[].status`, with the key exported from a tiny module that doesn't import the store) (1).
- A guard that you proved fails (1).
**Review rubric (3)**
- **The `next/dynamic` trap:** the agent wraps `LandingProgress` in `next/dynamic(..., { ssr: false })` and reports the critical bytes are
  back to normal. True, but the store still downloads and **its side effects still run** on the marketing page, a moment later. It's
  acceptable only as a conscious trade-off written in the PR, never as "fixed" (2).
- You rebuilt and diffed the script list yourself instead of trusting the agent's summary (1).

## Your one-line lesson
After each drill, add one line to `training/_work/agent-lessons.md`: what the agent claimed, what was true, and which check caught it.
After four drills, you should see a pattern: the agent is good at the edit and weak at **what the edit costs somewhere else**
(another component tree, another route's bundle, a platform guarantee). That's the part you're paid for.
