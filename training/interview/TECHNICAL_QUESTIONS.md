# Technical questions: RouteIQ edition (20)

Answer out loud with the file open. Model answers: `training/_answers/interview-technical.md`.
**Spoiler warning:** questions 5, 8, 9, 11 and 12 touch the mechanisms behind the ladder and incidents. Do this kit **after** them.

## React / rendering (6)
1. `DispatchScreen` subscribes to `selectedStopId`. Walk me through everything that re-renders when a dispatcher clicks one marker, and
   say which of those renders are necessary.
2. `const MemoMapView = memo(MapView)`: which prop, if a teammate passed it inline (`viewportInset={{ bottom: 0 }}`), would silently turn
   every panel interaction into a map render? Why doesn't `useStableCallback` in `MapViewInner.tsx` save you for objects?
3. zustand 5 + `useSyncExternalStore`: what happens if a component does `useAppStore(s => s.stops.filter(x => x.status === 'failed'))`?
   Give two correct alternatives.
4. `MapViewInner` uses `useDeferredValue(visibleStops, EMPTY_STOPS)`. What does the second argument do on the first render, and what
   metric does this protect?
5. `Toast.tsx` adjusts state during render (`if (toast !== prevToast) setPrevToast(...)`). When is that pattern correct, and what did it
   combine with to break (ladder M2)?
6. `DriverRoutes` loads dnd-kit through a hand-rolled external store instead of `React.lazy` + `Suspense`. What user-visible problem
   does that avoid?

## Performance / Core Web Vitals (4)
7. On localhost the LCP of `/dispatch` is the placeholder `<img>`, not a map tile. Is that honest? What would you measure instead?
8. How can one new client component on `/` add the store, the seed data and the optimizer's scheduler to the landing page's JS? How do you
   prove it, and how do you prevent it?
9. Why can a status strip that appears after a `fetch` cause CLS, when content that appears at first paint doesn't? Give two fixes.
10. This laptop's Lighthouse score for `/dispatch` is 54, or 71 "calibrated" (DECISIONS #44). How do you report performance honestly to
    a PM?

## Accessibility (4)
11. Why does a `role="status"` element that mounts together with its text often go unannounced? Find the instance of this in
    `StopSearch.tsx` that exists on `main`.
12. `DriverDialog` uses `showModal()`. List four things you lose if someone switches to `show()`.
13. The Undo action lives in a toast that auto-dismisses after 3.5 s. Which WCAG criterion is at risk, and what are your options?
14. 45 Leaflet markers are each a tab stop. Is that good keyboard access? Design a better path to "reassign stop S017".

## API / data / state (3)
15. Why does the client shape-check `/api/optimize` responses (`isOptimizeResponse`) even though the server validates with Zod?
16. The persisted blob goes through `pickPersisted` guards and `migratePersisted`. What happens to a v0 blob, and why drop the plan
    but keep delivery progress?
17. Two tabs write within 5 ms of each other. What does each tab end up showing, and what does the code comment say about it?

## Testing / operations (3)
18. Vitest runs in `node`. Which bug classes in this repo can't be caught at that layer? Which layer would you add first, and why?
19. `repair.ts` stops on `performance.now() > deadline`. What does that do to test determinism and CI, and how would you fix it
    without losing the time cap in production?
20. After a layout change to `/dispatch` ships, how would you *know* (not guess) that CLS regressed for real users? Which tool, which
    attribution, and what alert?
