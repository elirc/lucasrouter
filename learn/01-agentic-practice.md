# Agentic practice: you diagnose and specify, the agent types, you review

Four drills that turn existing `training/` material into practice at **directing** a coding agent and **refusing to trust it** until you've verified.
The full M1 loop lives in `training/agentic/WORKFLOW.md`. Do these drills first; they're smaller. Concept page:
curriculum 05: verify before trust (portfolio apprenticeship curriculum, not in this repo).

Rubrics and the traps each agent tends to fall into are sealed in `learn/_answers/01-agentic-practice.md`. Read them only after your review.

## The loop (same for every drill)
1. **Diagnose by hand.** Reproduce the symptom and write the causal chain in `training/_work/<drill>-diagnosis.md`. No agent in this step.
2. **Write the spec** in `training/_work/<drill>-spec.md`: the goal with a check that proves it, allowed and forbidden changes, the tests that must
   stay green, and the one new test that must go red → green. The agent gets this file verbatim.
3. **Run the agent** in a worktree on a branch off `main` (for incidents, a scratch branch where you re-injected the regression: the
   `training/incidents/*` branches were never pushed, see `learn/README.md`). Tell it: "One commit per causal change.
   Run `pnpm verify` after each. Don't claim a number you didn't measure; write 'unmeasured'."
4. **Adversarial review.** Read the whole diff yourself. Optionally have a second model review it with the prompt in `training/agentic/WORKFLOW.md` step 3.
5. **Verify yourself** with the checklist at the bottom. Agent-reported results don't count.
6. **Grade** against the sealed rubric. Write one line on what the agent got wrong and how you caught it (or didn't).

Setup for every drill: `pnpm install --frozen-lockfile` in the worktree. Production builds take about 4 minutes. Remove
worktrees with `git worktree remove`, never with a recursive delete.

---

## Drill A · Body limits on `/api/optimize` (ladder J3) · 60–90 min
**Source:** `training/ladder/J3-optimize-body-limits.md`. Branch off `main`.
**You by hand:** answer the ticket's five "Explain before touching" questions. Estimate the body size of a 1,000-stop request from
`src/data/stops.json`. Decide the status codes.
**Your spec must pin down:** the size limit and where it's enforced (header **and** while reading `request.body`); 413 vs 415 vs the existing 400;
the unchanged error shape `{ error, issues: [] }`; what the 500 branch returns (no `err.message` echo); the four new tests in
`tests/api-optimize.test.ts`; and one sentence on what the **store** does when it gets a 413 (read `optimize()` in `src/store/useAppStore.ts`).
**Agent does:** the implementation and the tests.
**You verify:** a request with no `Content-Length` and a 2.1 MB streamed body returns 413 (the test that matters most). `pnpm verify` green.
`docs/ALGORITHM_INTEGRATION.md` updated.

## Drill B · Restore modality in the driver sheets (INC-003) · 90 min
**Source:** `training/incidents/003-driver-sheet-keyboard.md`; the `training/incidents/003-driver-sheet-keyboard` branch is not on GitHub, so re-inject the regression on a scratch branch.
**You by hand:** reproduce all three driver reports with the keyboard on `/driver/D1` (production build). Check
`document.querySelector('dialog[open]').matches(':modal')` in the console on `main` and on the branch. Write the table "what `showModal()` gives
you that `show()` doesn't" and map each row to a report. Then pick how to solve the **original** QA problem (the Undo toast hidden behind an
open sheet) and write down why you rejected the alternatives.
**Your spec must pin down:** `DriverDialog.tsx` opens with `showModal()` again; the toast is visible **and clickable** while a sheet is open; the
`Toast`'s live region stays always-mounted; no new z-index war; and the verification command (`node training/tools/frontend-probe.mjs
http://localhost:3111 b --only=sheet` must print `closedByEscape/focusReturned/modal` all `true`).
**Agent does:** the fix.
**You verify:** run the probe yourself. Open a sheet, trigger an Undo toast, press Tab until you reach "Undo" and press it. Watch for the popover trap
(see the sealed answer). Keyboard pass on all three sheets (`DeliverySheet`, `FailReasonSheet`, `StopDetailsSheet`).

## Drill C · Typing lag after the map highlight (INC-004) · 90 min
**Source:** `training/incidents/004-search-highlight.md`; the `training/incidents/004-search-highlight` branch is not on GitHub, so re-inject the regression on a scratch branch.
**You by hand:** take the probe typing numbers on `main` and the branch in one session (`--only=typing --cpu=4`). Record a React Profiler session
while typing 5 characters (dev build) and list every component that renders per keystroke on each build. Find the one line whose position
causes it.
**Your spec must pin down:** the feature stays (non-matching markers dim); `DispatchScreen` must not subscribe to a per-keystroke value; only the
markers whose dimmed state flips may re-render; the input stays urgent (`useDeferredValue` or equivalent for the map side); a target number
(long-task count while typing at 4× within 2 of `main`'s); and a guard test or rule that fails if a future change puts the subscription back.
**Agent does:** the fix and the guard.
**You verify:** re-run the probe yourself, same session, three runs each. Re-record the Profiler. Check that `StopMarker` gets a **boolean** (or a
stable prop), not the query string. A memo on a component whose prop changes on every keystroke is pure overhead.

## Drill D · Keep the landing page static (INC-001) · 75 min
**Source:** `training/incidents/001-landing-bundle.md`; the `training/incidents/001-landing-bundle` branch is not on GitHub, so re-inject the regression on a scratch branch.
**You by hand:** after `pnpm build`, list the `<script src>` entries in `.next/server/app/index.html` on `main` and on the branch. Search the new
chunk for `routeiq-v1` or a seed address to name the modules. Read the store module's top-level statements and list what now **runs** on `/`.
**Your spec must pin down:** the counter stays; `/` must not import `@/store/*` (directly or through a component); the hydration-critical script list
of `/` returns to `main`'s count and gzip size (±1 KB); the seed and the `storage` listener are absent from `/`; and a guard (an ESLint
`no-restricted-imports` rule for `src/app/page.tsx` and `src/app/layout.tsx`, or the M4 budget).
**Agent does:** the fix and the guard.
**You verify:** rebuild and diff the script list yourself. **Don't accept "total JS is unchanged" as evidence**: that column hid the bug in the first
place. Temporarily add `import '@/store/useAppStore'` to `page.tsx` and confirm your guard fails.

---

## Verification checklist for agent output in this codebase
Use it on every drill. It adds RouteIQ-specific items to the general checklist in `training/agentic/WORKFLOW.md`.

**Gates you run yourself**
- [ ] `pnpm verify` (typecheck + `eslint . --max-warnings=0` + vitest). If the optimizer tests flake, re-run serially:
      `pnpm exec vitest run --no-file-parallelism` (`repair.ts` has a wall-clock budget, so timing depends on machine load).
- [ ] `pnpm build` and `pnpm smoke http://localhost:3111` for anything under `src/components/` or `src/app/`.
- [ ] Every number in the PR text: you reproduced it with `training/tools/frontend-probe.mjs`, same machine, same session, a median of ≥ 3 runs.

**Invariants that are easy to break here (name the file when you check)**
- [ ] `src/app/layout.tsx` and `src/app/page.tsx` still import nothing from `@/store/*` or `@/components/map` (static landing, DECISIONS #34).
- [ ] `src/components/ui/Toast.tsx`: the element with `role="status"` / `aria-live` is **always mounted**. There's no early `return null`.
- [ ] `src/components/driver/DriverDialog.tsx` opens with `showModal()`. A comment claiming "our code covers the rest" is not a substitute.
- [ ] `src/store/useAppStore.ts`: a new field is either in `PERSISTED_KEYS` **with** a guard in `PERSISTED_GUARDS` (and a thought about
      `PERSIST_VERSION` / `migratePersisted`), or it's ephemeral and absent from both. Selectors return stable values (no `filter`/object
      literals without `useShallow` or `useMemo`).
- [ ] `src/components/dispatch/DispatchScreen.tsx` gained no new `useAppStore` subscription to a fast-changing value.
- [ ] `src/app/api/optimize/route.ts`: the error shape `{ error, issues }` and the 400 contract are unchanged
      (`docs/ALGORITHM_INTEGRATION.md`), and no internal error message reaches the client.
- [ ] Lazy boundaries are intact: `MapView.tsx`'s `next/dynamic(..., { ssr: false })`, the lazy `import('@/lib/optimizer')` in `optimize()`,
      and dnd-kit loaded only on desktop (`DriverRoutes.tsx` `useDndModule`).

**Checks only a human does**
- [ ] A keyboard-only pass over everything the diff touched, at 390 px **and** 1366 px (two different component trees).
- [ ] For a11y changes: the DevTools Accessibility pane (or NVDA/Narrator) confirms what's announced. axe passing is not proof.
- [ ] Every new `memo`/`useMemo`/`useCallback` has a render you can name that it prevents, shown in the Profiler.
- [ ] No test was weakened, skipped or rewritten to pass. Diff `tests/` separately.
