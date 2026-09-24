# Flashcards: RouteIQ (24)

Front | Back. Each card is tied to a file or exercise. Do them after the incidents.

1. Where is the only place Leaflet is allowed to enter the bundle? | `MapView.tsx`: `next/dynamic(() => import('./MapViewInner'), { ssr:false })` plus a module-eval preload.
2. Why doesn't the root layout render `<Toast />`? | It reads the store, which would put the store, the seed and the scheduler into every page, including the static landing (`layout.tsx` comment, DECISIONS #34).
3. What does zustand 5 require of a selector's return value? | Referential stability. A fresh array or object per call loops or re-renders (store "SELECTOR NOTE").
4. Cheapest way to let one row know it's selected? | A boolean selector, `useAppStore(s => s.selectedStopId === id)`. Only 2 rows re-render per click.
5. What does `memo(MapView)` in `DispatchScreen` protect? | The map from panel-only re-renders, as long as every prop keeps its identity (`viewportInset` is memoized for this reason).
6. What does `useDeferredValue(visibleStops, EMPTY_STOPS)` buy? | The first commit paints tiles and the viewport, and markers stream in as a time-sliced low-priority render (LCP, long tasks).
7. Why are stop icons cached in `icons.ts`? | A new `divIcon` instance makes Leaflet rebuild the marker DOM. The cache maps a visual state to one instance.
8. Marker-click p75 on `main`, this laptop, 1× and 4×? | ~225–240 ms and ~1.1–1.5 s (probe `--only=clicks`, Event Timing). The target is < 200 ms.
9. How long is the "Routes ready" toast visible on `main`? | ~161 ms (probe). The Export toast is fine. Ladder M2.
10. When does a live region announce reliably? | When the region is already in the accessibility tree **before** its content changes.
11. Which `main` component mounts its `role="status"` together with its text? | `StopSearch.tsx`, the "N stops found" line (it renders only while filtering).
12. Four things `showModal()` gives that `show()` doesn't? | Top layer, an inert background (pointer, keyboard **and** AT), Escape → `cancel`, `:modal` + `::backdrop`.
13. Why does `DriverDialog` focus the panel instead of the first button? | A held Enter on "Delivered" would auto-repeat onto Close and dismiss the proof sheet.
14. Keyboard alternative to dragging a stop? | The "⋯" `MoveStopMenu` (roving focus, Arrow/Home/End, Escape returns focus to the trigger).
15. What makes optimizer output load-dependent? | `repair.ts` stops at a wall-clock `deadline` (`performance.now()`). Run tests serially after a build.
16. What happens when `/api/optimize` fails or returns a bad shape? | The store lazily imports `@/lib/optimizer` and solves on the **main thread** (`optimize()` in the store).
17. Client-side timeout on optimize vs server `maxDuration`? | 8 s `AbortSignal.timeout` vs 30 s. The client gives up long before the function does.
18. Persisted key and version? | `routeiq-v1`, `PERSIST_VERSION = 1`. v0 blobs keep data and progress, and drop the plan (`migratePersisted`).
19. What does the storage adapter skip, and how? | Writes for ephemeral-only updates: a reference compare of the persisted keys, then a string compare with `knownStored`.
20. Photo budget, and what happens over it? | `PHOTO_BUDGET_BYTES = 1.5 MB`. The delivery is still recorded, the photo is dropped, and the UI is told (`photoDropped`).
21. Why is lab CLS 0 on `main` meaningful? | Skeletons mirror the final layout (`DispatchSkeleton.tsx`). Anything inserted above the map after first paint breaks that (incident 005).
22. Decoded JS per route on `main` (probe)? | `/` ~609 KB, `/dispatch` ~802 KB, `/driver/D1` ~904 KB. Leaflet on the map routes only.
23. Why compare perf only within one session on one machine? | This laptop's CPU is slower than Lighthouse's reference (DECISIONS #44). Absolute scores mislead; deltas of medians don't.
24. What does axe not test that this app needs? | Tab order through 45 markers, focus return after sheets, whether announcements are *heard*, and timing (a 3.5 s Undo toast).
