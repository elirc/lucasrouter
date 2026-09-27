# Studying RouteIQ (lucasrouter): a junior's route through the frontend lab

This folder is the on-ramp to `training/`. `training/` was written for a mid-level engineer. This guide assumes you are a
junior with shaky fundamentals who wants to learn **through this repo**, and to learn to direct coding agents while doing it.
Nothing here replaces `training/`. It tells you in what order to use it, what to do yourself, and what to hand to an agent.

## What this app is and why it's in the portfolio
RouteIQ is a delivery-route optimizer demo: a Next.js 16 / React 19 App Router app with a zustand store persisted to `localStorage`
(`src/store/useAppStore.ts`), a Leaflet map (`src/components/map/`), a dispatcher screen (`src/components/dispatch/DispatchScreen.tsx`),
a driver app (`src/components/driver/`) and one real API route (`src/app/api/optimize/route.ts`). There is no database.
It is the portfolio's **frontend performance + accessibility lab**: the only repo where you measure render cost, bundles and Core Web Vitals
on production builds, and where you find bugs with a keyboard and a screen reader instead of a unit test (see `training/README.md`).

## Before you run anything
- `node_modules` was removed to free disk space. Run **`pnpm install --frozen-lockfile`** once in the repo root before any session that
  runs code (the lockfile is `pnpm-lock.yaml`; don't use `npm install`). Each incident worktree needs its own install too.
- The working tree has **your own uncommitted work** (the delivery-validation change: `src/lib/deliveryValidation.ts`,
  `src/store/useAppStore.ts`, `tests/delivery-validation.test.ts`, and the `astraupskill/`, `dfableandopus/` trees). Don't stash or reset it
  to do these exercises. Line numbers in this guide refer to the committed `main` (`git show HEAD:<file>`), which can differ from your
  working copy of `useAppStore.ts` by a few lines. Search by function name.
- Incidents live on branches. Use `git worktree add ..\lr-inc-002 training/incidents/002-toast-announcements`, and remove it with
  `git worktree remove ..\lr-inc-002`. **Never** delete a worktree folder with a recursive delete: `node_modules` inside it can be a
  junction into real data (portfolio rule after a real data-loss incident).
- A production build takes about 4 minutes on this laptop. Performance numbers are only comparable within one session on one machine.

## Prerequisites (fundamentals to have first)
Read each one before the session that needs it. The central pages are short. Don't skip the "worked examples" part, which points back here.
1. **React rendering: what makes a component re-render** (state, props identity, parent re-render, context/store subscription). Read
   `training/navigation/FIRST_CHANGE.md` items 3–4 and the "SELECTOR NOTE" at the top of `src/store/useAppStore.ts`. On-ramp 5 checks it.
2. **Server vs client components in the App Router** (`'use client'` boundary, why `src/app/layout.tsx` refuses to render `<Toast />`).
   Read the comment at the bottom of `src/app/layout.tsx` and DECISIONS #34. Then [curriculum 12: frontend performance](../../opusorganize/apprenticeship/curriculum/12-frontend-performance.md).
3. **Accessibility basics: keyboard, focus, live regions, contrast.** [curriculum 11: accessibility](../../opusorganize/apprenticeship/curriculum/11-accessibility-essentials.md).
   Then read `src/components/ui/Toast.tsx` and the effect in `src/components/driver/DriverDialog.tsx` (`showModal()`).
4. **Tests you can trust, especially for code you didn't write:** [curriculum 04: characterization tests](../../opusorganize/apprenticeship/curriculum/04-characterization-tests.md)
   and the style of `tests/api-optimize.test.ts` (route handlers called as plain functions).
5. **Verifying agent output:** [curriculum 05: verify before trust](../../opusorganize/apprenticeship/curriculum/05-verify-before-trust.md).
   This is the rule behind every "delegate" line below.
6. (Before the last session) **Release safety and gates:** [curriculum 13](../../opusorganize/apprenticeship/curriculum/13-release-safety.md),
   used by ladder S2.

## Study route (12 sessions, about 15 hours, then the long tickets)
Each session ends with an **exit criterion**. If you can't meet it, repeat the session. "Do" = by hand, no agent. "Delegate" = give it to a
coding agent with a spec you wrote, then verify it yourself with the checklist in `learn/01-agentic-practice.md`.

| # | Session (time) | Exact material | Do by hand | Delegate, then verify | Exit criterion |
|---|---|---|---|---|---|
| 1 | Read the map (60 min) | `training/navigation/FIRST_CHANGE.md`, `training/navigation/ARCHITECTURE.md` §1–5, `src/lib/types.ts` | All reading. Draw the three flows (Optimize, select a stop, driver delivers) on paper | Nothing | Without notes, you can say which file handles each step of flow A (Optimize) from the button to the toast |
| 2 | Run it (60 min) | `pnpm install --frozen-lockfile`, `pnpm verify`, `pnpm build`, `pnpm start --port 3111`; open `/`, `/dispatch`, `/driver/D1` | Click through the dispatcher day and the driver flow. Resize under 768 px and watch the tree switch (`useIsDesktop.ts`) | Ask an agent to explain one unfamiliar pnpm or Next error, if you hit one. Check its answer against the docs | `pnpm verify` is green, and you can show both the `BottomSheet` layout and the `<aside>` layout of `/dispatch` |
| 3 | On-ramp A (60 min) | `learn/00-onramp.md` exercises 1–5 | All of it. Predict first, then check in code or the console | Nothing | 4 of 5 answers match `learn/_answers/00-onramp.md` in substance |
| 4 | On-ramp B + first test (75 min) | `learn/00-onramp.md` exercises 6–10 | Exercises 6, 7, 9, 10. Write the characterization test in exercise 8 yourself | Nothing yet (your first test must be yours) | Your new test in `tests/` passes with `pnpm exec vitest run <file>`, and it fails if you break `driverProgress` on purpose |
| 5 | Baseline + blind review (90 min) | `training/tools/frontend-probe.mjs` on `main` (see its header), then `training/review/EXERCISE.md` + `COMPARE.md` | The review itself, and choosing what to probe | Have an agent write a small script that prints the probe JSON as a table. Read the script before running it | You saved a `main` baseline JSON, and at least 3 of your review findings have `file:line` evidence and match a finding in `_answers/review.md` |
| 6 | Junior tickets (90 min) | `training/ladder/J1-overview-counts.md`, `training/ladder/J3-optimize-body-limits.md` | J1 completely (it's small, do it all). For J3: answer "Explain before touching", write the spec | J3's implementation (drill A in `learn/01-agentic-practice.md`) | J1: your pure function + tests are green. J3: the drill A rubric scores ≥ 8/10 |
| 7 | Component tests (90 min) | `training/ladder/J2-component-test-foundation.md` | Choose what to assert (the three Toast tests, the StopSearch test). Answer the four questions | Vitest project config + dev dependencies. Check that the node project still runs only `tests/**/*.test.ts` | `pnpm test` runs both projects. If test (c) fails on `main`, you wrote down what you saw instead of weakening it |
| 8 | A11y incidents (90 min) | `training/incidents/002-toast-announcements.md`, `003-driver-sheet-keyboard.md` (worktrees + builds) | Reproduce both with the keyboard and DevTools' Accessibility pane. Write the causal explanation | The 003 fix (drill B), after your diagnosis is written | You can explain, without notes, why axe stayed green in 002, and list everything `showModal()` gives that `show()` doesn't |
| 9 | Bytes and layout shift (90 min) | `training/incidents/001-landing-bundle.md`, `005-optimizer-status-strip.md` | Listing the critical `<script src>` of `/` from `.next/server/app/index.html`; finding the shifted nodes in the Performance panel | The 001 fix (drill D) | You can say which JS column in the 001 table matters and why, and name the node that moves in 005 |
| 10 | Render storms (90 min) | `training/incidents/004-search-highlight.md`, then start `training/ladder/M1-marker-click-inp.md` via `training/agentic/WORKFLOW.md` | The Profiler trace and the list of components that render per keystroke. M1 steps 0–1 (baseline + spec) | The 004 fix (drill C); M1 steps 2–4 | Your before/after table for 004 comes from one session, and you wrote the M1 spec before any agent touched code |
| 11 | The real toast bug + timing (90 min) | `training/ladder/M2-vanishing-toast.md`, then `training/ladder/J4-actionable-toast-timing.md` (added in this pass) | M2: the instrumented timeline and the failing test. J4: the WCAG reasoning | J4's implementation, after M2 is merged | Your M2 test is red on `main` and green with the fix; the probe shows the toast for about 3.7 s |
| 12 | Audit, gates, interview (90 min) | `training/ladder/M3-axe-keyboard-audit.md` (start), `training/ladder/S2-frontend-quality-gates-and-rum.md` (read), `training/interview/MOCK_DEFENSE.md` | The keyboard-only and screen-reader parts of M3 (an agent can't do these). Your answers in the mock defense | Injecting axe with puppeteer and saving the JSON per state. Running the mock interviewer | Mock defense scored with the rubric in `MOCK_DEFENSE.md`, and you can defend questions 3–5 without buzzwords |

After session 12 the rest of `training/` is multi-day work: finish M1/M3/M4, then S1 and S2 (design docs), then all of `training/interview/`.
Follow `training/README.md` "Suggested order" for that part.

## Do vs. delegate: the rule for this repo
- **Always by hand:** reading the code path, reproducing the symptom, the causal explanation, the spec, the review, and every a11y check that needs
  a keyboard or a screen reader. Those are the skills an employer pays for when agents write the code.
- **Delegate:** config and boilerplate (Vitest projects, CI YAML), mechanical fixes you have already diagnosed, probe/report scripts.
- **Never accept from an agent:** a performance claim without a number you re-measured, "it's accessible" without a keyboard pass, or a fix
  that moves a platform guarantee (`showModal()`, the always-mounted `role="status"` in `Toast.tsx`) into a comment.

## How you know you're done here
- You finished sessions 1–12, all five incidents, J1–J4, M1–M3, and the mock defense.
- You can explain these without notes: why one `'use client'` import changes a route's bundle (INC-001); why a live region must exist before
  its text (INC-002); what `showModal()` gives you (INC-003); why a store subscription in `DispatchScreen` costs more than the diff suggests (INC-004).
- You ran at least three agent drills from `learn/01-agentic-practice.md` and caught at least one wrong agent claim with a measurement.

**Next repo in the competency graph:** perch (B02 DRILL: two more frontend incidents and an existing a11y audit to read), then
gitjira-app ladder M1 (frontend performance on a full-stack app with a real backend). See rows "Frontend performance",
"Accessibility" and "Web / React / frontend testing" in `Desktop\opusorganize\apprenticeship\COMPETENCY_GRAPH.md`.
