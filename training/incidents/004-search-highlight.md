# INC-004 · "Search is laggy since the map highlight shipped"

**Branch:** `training/incidents/004-search-highlight` · **Severity:** Sev-3 (degraded core interaction, no data loss)

## Report
> Dispatcher, Badger Parcel (a 6-year-old office desktop): "Typing an address in *Search stops* now stutters. Letters appear in bursts.
> The new dimming on the map is nice, but I type faster than it keeps up."

## Lab measurement (production builds, same laptop, same session, desktop `/dispatch` after Optimize, 4× CPU,
`frontend-probe.mjs --only=typing`; 25 keystrokes 120 ms apart into *Search stops*, three runs each)
| Build | long tasks while typing | long-task time | keydowns ≥ 16 ms (worst) |
|---|---|---|---|
| `main` (fafe0c7) | 0 / 1 / 1 | 0 / 57 / 55 ms | 0 |
| `5ef3a5b` | **21 / 20 / 20** | **1,941 / 1,398 / 1,663 ms** | 1 (168 / 160 / 104 ms) |

Marker-click latency on the same branch didn't change (p75 1,368 ms at 4× vs 1,064–1,456 ms on `main` in the same session).

Event Timing only reports events ≥ 16 ms. Why can the long-task time explode while almost no keydown event is reported as slow? (Think about which task the React render for a keystroke actually runs in.)

## Timeline
- Wed: deploy `5ef3a5b` "feat(dispatch): dim non-matching stops on the map while searching". CI green, and review approved in 20 minutes
  ("small, well-contained").
- Thu: two complaints like the one above. None from dispatchers on new laptops.

## Suspect PR diff (`5ef3a5b`, abridged, 6 files, +24/−1)
```diff
 // src/store/useAppStore.ts
+  /** Dispatcher stop search text; the map dims stops that do not match. NOT persisted. */
+  searchQuery: string;
+  setSearchQuery(query: string): void;
+      setSearchQuery(query) { set({ searchQuery: query }); },

 // src/components/dispatch/StopSearch.tsx
-  const [query, setQuery] = useState('');
+  // Shared with the map (it dims stops that do not match), so it lives in the store.
+  const query = useAppStore(s => s.searchQuery);
+  const setQuery = useAppStore(s => s.setSearchQuery);

 // src/components/dispatch/DispatchScreen.tsx
   const selectedStopId = useAppStore((s) => s.selectedStopId);
+  const searchQuery = useAppStore((s) => s.searchQuery);
             selectedStopId={selectedStopId}
+            highlightQuery={searchQuery}

 // src/components/map/MapViewInner.tsx  →  <StopMarker … highlightQuery={highlightQuery} />
 // src/components/map/StopMarker.tsx
+  const q = highlightQuery.trim().toLowerCase();
+  const dimmed = q !== '' && !`${stop.address} ${stop.recipient} ${stop.id}`.toLowerCase().includes(q);
+      opacity={dimmed ? 0.3 : 1}
```

## Your job
1. Reproduce it with the probe and with a Performance trace of typing 5 characters (at 4× CPU). What runs on each keystroke that didn't before?
2. Use the React Profiler (dev build) to list the components that render per keystroke, before and after. Why did the review call this
   "well-contained"?
3. Fix it without losing the feature. At least two options, one chosen, before/after numbers from the same session.
4. Add a guard that would fail if a future change reintroduces it.

Sealed answer: `training/_answers/incident-004.md`
