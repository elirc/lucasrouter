# M2 reference: the 161 ms toast

## What was observed (2026-09-24, this laptop)
- Probe (`--only=toast`, production build of fafe0c7): the "Routes ready · 3 drivers · 175 km" card was inserted and then removed
  **161 ms** later. A MutationObserver on the toast container saw `childList +1` at t, then `-1` at t + ~190–230 ms (three runs).
- `next dev` with logs in `Toast.tsx`:
  ```
  toast render  toast=1 shown=null prev=null    ← store toast arrives; render-phase adjust runs
  toast render  toast=1 shown=1    prev=1
  effect-toast-branch 1                          ← 3.5 s dismiss timer scheduled (correct)
  … ~200 ms later, with no dismissToast() call and no exit-timer callback:
  toast render  toast=1 shown=null prev=1        ← shown reverted, prevToast kept
  ```
  `useAppStore.subscribe` confirmed the **store** still had the toast until the normal 3.5 s dismissal.
- **Minimal change that makes it disappear:** don't schedule the idle-branch timer when nothing is shown (dev build experiment).
- **The reference fix below, verified:** production scratch build, probe `--only=toast` → `visibleMs: 3728` (was 161–180), and
  `regionExistedBefore: true`.

## Causal chain (reference)
1. On mount, `toast === null`, so the effect's *else* branch schedules `setTimeout(() => setShown(null), EXIT_MS)`. It fires about 200 ms
   later and calls `setShown(null)` while `shown` is **already** `null`.
2. React can bail out of an equal-value update *eagerly*, but it may still leave that update queued on the hook, to be processed with
   the next render of this fiber (the "eager bailout still enqueues" path in React's concurrent update queue).
3. After Optimize, the store toast arrives. During render, `setPrevToast(toast)` and `setShown(toast)` are applied as **render-phase
   updates**, and the card commits.
4. Another re-render of `Toast` follows. On desktop this happens when `DispatchScreen`-level state changes after optimize: dnd-kit's
   module store resolves, `fitKey` changes, and so on. The hook queue is re-processed, and the stale `null` update wins over the
   render-phase `shown = toast`, while `prevToast` keeps its value. With `toast === prevToast` the derived-state block never re-sets
   `shown`, so the card is gone.
5. **Why Export works:** the Export toast comes long after the page has re-rendered for other reasons, so the stale update has already
   been consumed. **Why it's "on desktop after Optimize":** that's where a follow-up re-render lands inside the window.

Treat steps 2 and 4 as the best-supported mechanism, not gospel. The evidence is the instrumented timeline plus the minimal-fix
experiment. A senior writes "React internals interaction; mitigated by not deriving `shown` with render-phase updates paired with an
unconditional idle timer", and doesn't claim to have found a React bug without a minimal repro.

## Reference fix (inside `Toast.tsx`, PR-sized)
Derive visibility, don't mirror it. Keep a `lastShown` value that only changes when a **new** toast arrives, and an `exiting` flag
driven by one timer:
```tsx
const [exitingToast, setExitingToast] = useState<ToastState | null>(null);
const [prev, setPrev] = useState(toast);
if (toast !== prev) { if (prev && !toast) setExitingToast(prev); if (toast) setExitingToast(null); setPrev(toast); }
useEffect(() => { if (toast) { const t = setTimeout(dismissToast, AUTO_DISMISS_MS); return () => clearTimeout(t); } }, [toast, dismissToast]);
useEffect(() => { if (exitingToast) { const t = setTimeout(() => setExitingToast(null), EXIT_MS); return () => clearTimeout(t); } }, [exitingToast]);
const shown = toast ?? exitingToast;
```
There is no timer when idle, and no state that can be reverted independently of its partner. The live-region container stays
unconditionally mounted (see incident 002).

## Regression test (component, needs J2)
Mount `<Toast/>` → `act(advance 250 ms)` (the idle timer era) → `act(showToast('Routes ready · …'))` → `act(setState({ selectedStopId: 'S001' }))`
(an unrelated re-render) → assert the text is still in `getByRole('status')` → advance 3,500 ms → gone after 200 ms more. The key is the
unrelated re-render. Without it, the test passes on `main`.

## Smoke assertion that would have caught it
After clicking Optimize: `waitForFunction(() => /Routes ready/.test(document.body.innerText))`, then `sleep(1000)`, then assert it's still
present. The existing smoke asserts outcomes (routes, metrics), never feedback.

## Rubric
Timeline with state names (3) · evidence-based mechanism with honest uncertainty (3) · failing-first test including the unrelated re-render (2) · fix scoped to Toast, no timing changes (1) · smoke assertion (1).
