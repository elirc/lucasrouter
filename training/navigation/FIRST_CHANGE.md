# Before your first production change in RouteIQ

A one-page list of the things that bite here and not in a typical CRUD app.

1. **Two trees, one screen.** `/dispatch` mounts a `BottomSheet` below 768 px and an `<aside>` above it (`DispatchScreen.tsx`,
   `useIsDesktop.ts`). dnd-kit loads only on desktop. Test both viewports, every time. The smoke run does (375×812 and 1366×850).
2. **The store is the backend.** Every action in `useAppStore.ts` is a "service method" whose writes are persisted and broadcast to
   other tabs. A new field is either persisted (add it to `PERSISTED_KEYS`, a guard in `PERSISTED_GUARDS`, and think about
   `PERSIST_VERSION`/`migratePersisted`) or ephemeral (then **never** put it in `PERSISTED_KEYS`). Getting this wrong corrupts other tabs.
3. **Selectors must return stable values.** zustand 5 + `useSyncExternalStore`: a selector that builds a new array or object each call
   loops or re-renders forever. Select raw slices and derive with `useMemo`, or use `useShallow`. See the "SELECTOR NOTE" at the top of
   the store. Subscribing a high-level component (like `DispatchScreen`) to a fast-changing value re-renders everything beneath it.
4. **Hydration gating.** Pages render skeletons until `useHasHydrated()` (server snapshot `false`). Don't read `localStorage`, `Date`
   or `matchMedia` during render in a way that makes server and client HTML differ.
5. **The module graph is a performance feature.** Leaflet, dnd-kit, road paths, dialogs and the local optimizer are all lazy on
   purpose (docs/REBUILD.md). One static import in the wrong file undoes that. Check the route's JS after `pnpm build` (ladder M4).
6. **A11y has been engineered in.** Keep it that way: native `<dialog>` + `showModal()` (`DriverDialog.tsx`), focus return, a persistent
   `role="status"` toast region, roving focus in `MoveStopMenu`, AA contrast notes in comments. If you touch these, re-run the keyboard
   flow and a screen reader. Neither the unit tests nor the smoke checks do.
7. **Comments are persuasive, not proof.** This codebase explains itself at length, and some explanations describe an older state
   (DECISIONS #54 describes `experimental.inlineCss`, but `next.config.ts` doesn't set it). Verify behaviour.
8. **Timing-dependent code.** `repair.ts` stops on a wall-clock deadline, so results depend on machine load. Run the tests serially after
   a build (`pnpm exec vitest run --no-file-parallelism`, docs/REBUILD.md).
9. **Numbers need a machine.** This laptop is slower than Lighthouse's reference device (DECISIONS #44). Compare before/after on the
   same machine in the same session, as medians. Never quote a single run.

**Your pre-merge checklist:** `pnpm verify` · `pnpm build` · `pnpm smoke http://localhost:3111` · the probe at 1× (and 4× for perf changes)
· keyboard pass on what you touched · both viewports.
