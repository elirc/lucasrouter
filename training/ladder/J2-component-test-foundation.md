# J2 · Give the UI its first component tests

**Rung:** junior · **Time:** 3 h · **Skills:** frontend testing strategy, Vitest projects, Testing Library, fake timers

## Context
All 7 test files (`tests/*.test.ts`) run in `environment: 'node'` (`vitest.config.mts`). The store tests fake `window` by hand.
UI behaviour is checked only by `scripts/smoke-e2e.mjs` (puppeteer, needs a built server and local Chrome, 56 checks) and
`scripts/workspace-e2e.mjs`. DECISIONS #3 records that no component-test framework was added. So nothing between a pure unit
test and a full-browser smoke run checks what a component renders.

## Ticket
> **RIQ-120** Lead: "We keep finding UI regressions only in the smoke run, which takes minutes and a server. Add a fast component-test
> layer. Start with `Toast` and `StopSearch`, the two components we touched most this month."

## Constraints
- Keep the existing node tests in node. Add a second Vitest **project** (or a workspace entry) for `tests/components/**/*.test.tsx`
  with `jsdom` or `happy-dom`. Adding the matching dev dependencies is fine. Changing existing tests is not.
- Test through the accessibility tree (`getByRole`, `getByLabelText`), not class names.
- Set store state with `useAppStore.setState(...)` in the test, and reset it in `afterEach`.

## Definition of done
- `pnpm test` runs both projects. `pnpm verify` is green.
- `Toast`: (a) a toast's message renders inside `role="status"`; (b) the live region exists **before** any toast is shown;
  (c) with fake timers the toast is still visible at 3,000 ms and gone after 3,500 + 200 ms.
- `StopSearch`: typing "univ" plus the status filter "Pending" shows the right count in the "N stops found" status line.
- A short note in the PR description: what this layer catches that the smoke run doesn't, and the reverse.

## Explain before touching
1. Why can't `tests/store.test.ts` just switch to jsdom? What does it rely on (`installFakeWindow`-style helpers, `fireStorage`)?
2. `Toast` reads `useAppStore`. What leaks between tests if you don't reset the store, and why is `toastSeq` (module-level) a trap?
3. Which of the 56 smoke checks could move down into component tests, and which must stay end-to-end? Name two of each.
4. Test (c) uses fake timers. Which React APIs in `Toast.tsx` depend on timers or effects, and how does `act()` interact with them?

<details><summary>Hints</summary>

- Vitest 4: `test.projects: [{ extends: true, test: { name: 'node', ... } }, { extends: true, test: { name: 'dom', environment: 'jsdom', include: [...] } }]`.
- If test (c) fails on `main`, **don't weaken it.** Write down what you observed. That is ticket M2.
</details>

Sealed answer: `training/_answers/ladder-J2.md`
