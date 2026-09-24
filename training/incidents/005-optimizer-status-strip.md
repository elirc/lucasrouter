# INC-005 · The dispatcher map "jumps" on load

**Branch:** `training/incidents/005-optimizer-status-strip` · **Severity:** Sev-4 (Core Web Vitals regression + a misclick risk)

## Report
> Dispatcher (phone): "When I open Dispatch, the map loads and then the whole thing jumps down. Twice this week I tapped the Legend chip,
> and it moved, so I got the zoom button instead."
> PM: "We committed to zero layout shift on `/dispatch` (DECISIONS: the skeletons mirror the final layout). Is this a regression?"
> (There's no field data in this repo, so reproduce it in the lab.)

## Lab measurement (production builds, same laptop, same session, 390×844, 4× CPU, medians of 3, `frontend-probe.mjs --only=vitals`)
| Build | `/dispatch` CLS | `/` CLS | `/driver/D1` CLS | `/dispatch` JS |
|---|---|---|---|---|
| `main` (fafe0c7) | **0** | 0 | 0 | 802 KB |
| `860f5f3` | **0.04** | 0 | 0 | 803 KB |

0.04 is below Google's 0.1 "good" threshold, and the lab page is empty (fresh storage, fast local server). Why would you still treat this as
a regression? What would the number look like on a slow phone network, where `/api/health` answers after the tiles have painted?

## Timeline
- Mon: deploy `860f5f3` "feat(dispatch): optimizer status strip under the app bar". Ops asked for it so support calls can quote the
  algorithm version. CI green. The smoke run passed (all 56).

## Suspect PR diff (`860f5f3`, abridged)
```diff
 // src/components/dispatch/DispatchScreen.tsx
       <DispatchTopBar />
+      <OptimizerStatus />
       <DispatchOverview />

 // src/components/dispatch/OptimizerStatus.tsx (new)
+export function OptimizerStatus() {
+  const [health, setHealth] = useState<Health | null>(null);
+  useEffect(() => {
+    const ctrl = new AbortController();
+    fetch('/api/health', { signal: ctrl.signal, cache: 'no-store' })
+      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
+      .then((body: Health) => setHealth(body))
+      .catch(/* → { ok: false, unreachable: true } */);
+    return () => ctrl.abort();
+  }, []);
+  if (!health) return null;
+  return <div className="flex min-h-9 items-center gap-2 border-b …">Optimizer online · {algorithm} · API {version}</div>;
+}
```

## Your job
1. Reproduce the number. Then use DevTools → Performance → "Layout shifts" to find **which** nodes moved and by how much. Why is the
   impact so large for a 36 px strip?
2. Explain why the smoke run and the unit tests can't see this.
3. Fix it with two alternative designs, pick one, and show before/after CLS from the same session. The strip's content must stay.
4. Would this shift count on desktop too? Check at 1366×850 and explain the difference.

Sealed answer: `training/_answers/incident-005.md`
