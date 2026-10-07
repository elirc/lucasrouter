# RouteIQ training lab (B03, LAB tier): frontend focus

RouteIQ is the portfolio's **frontend lab**: React rendering cost, zustand selector granularity, the Next App Router module graph,
Core Web Vitals with honest numbers, and accessibility (keyboard, focus, live regions, contrast). Most exercises came from **running**
the app, and several numbers below were measured for this lab on 2026-09-24 (production build, this laptop, `training/tools/frontend-probe.mjs`).

> **Calibration:** this laptop is slower than Lighthouse's reference device (DECISIONS #44). Every number here is a same-machine,
> same-session median or delta. Don't compare it with numbers from another machine.

## Contents
| Folder | What | Answers |
|---|---|---|
| `ladder/` | J1–J3 junior, M1–M4 mid, S1–S2 senior tickets | `_answers/ladder-*.md` |
| `review/` | 60-min blind review + `COMPARE.md` | `_answers/review.md` (24 findings) |
| `incidents/` | 5 incident briefs, each with a bug committed on `training/incidents/NNN-*` | `_answers/incident-NNN.md` |
| `navigation/` | architecture with evidence, first-change guide, 4 "Why?" drills, a change request | `_answers/navigation-change-request.md` |
| `agentic/` | M1 run as spec → implementer → adversarial reviewer → your explanation | graded against `_answers/ladder-M1.md` |
| `interview/` | stories, 20 questions, system design, mock defense script, 24 flashcards | `_answers/interview-technical.md` |
| `tools/frontend-probe.mjs` | LCP/CLS/JS bytes, marker-click and typing INP proxy, live-region and dialog checks | – |

> **Status note (checked 2026-10-06):** the `training/incidents/NNN-*` branches
> were created locally and never pushed. GitHub has only `main`
> (`git ls-remote --heads origin`), so the `git worktree add` command in step 4
> fails on a fresh clone. Until those branches are published, use each brief's
> "Suspect PR diff" to recreate the bug yourself on a scratch branch, and use
> `_answers/incident-NNN.md` to check your diagnosis.

## Suggested order (~45–55 h)
1. `navigation/FIRST_CHANGE.md` + `ARCHITECTURE.md` (2 h). Build and run the app. Run the probe on `main` once and keep the output.
2. `review/EXERCISE.md` (1.5 h incl. COMPARE).
3. Ladder junior: **J2 first** (it sets up component tests, which M2 and incident 002 reuse), then J1, J3 (7 h).
4. Incidents 001 → 005 (2–3 h each). Checkout pattern:
   `git worktree add ..\lr-inc-001 training/incidents/001-landing-bundle`, then build, start and probe there.
5. Ladder mid: M2 (the real toast bug), M1 (via `agentic/WORKFLOW.md`), M3 (audit), M4 (budgets) (4 days).
6. `navigation/TRADEOFFS.md` + `CHANGE_REQUEST.md` (3 h).
7. Senior: S1, S2 design docs (2–3 days).
8. `interview/`: after everything else (it contains spoilers). Mock defense last.

## Real bugs on `main` (not seeded): treat as tickets, don't fix on main
- The dispatcher's "Routes ready" toast is visible for ~161 ms (ladder M2).
- Marker-click INP p75 is ~225–240 ms at 1× and ~1.1–1.5 s at 4× CPU (ladder M1).
- `StopSearch`'s result-count live region mounts along with its text (review #4, ladder M3).

## Existing learning trees in this repo
`astraupskill/` and `dfableandopus/` cover the delivery-proof **validation boundary** change (`src/lib/deliveryValidation.ts`,
committed in e1e05c2). They're backend/state-focused and complement this frontend lab. Use them for the
"runtime validation" story. This lab doesn't duplicate them.

Central concept pages: `C:\Users\Owner\Desktop\opusorganize\apprenticeship\curriculum\` (05 verify-before-trust is used by `agentic/`).
