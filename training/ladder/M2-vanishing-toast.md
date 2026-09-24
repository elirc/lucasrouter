# M2 · The "Routes ready" toast flashes and disappears

**Rung:** mid · **Time:** 0.5–1 day · **Skills:** React state derivation, effects and timers, writing the failing test first

## Context
`src/components/ui/Toast.tsx` should show a store toast for 3.5 s (`AUTO_DISMISS_MS`) and then animate out over 200 ms (`EXIT_MS`).
On `main` (fafe0c7, production build) the probe (`frontend-probe.mjs --only=toast`) records the dispatcher's
"Routes ready · 3 drivers · 175 km" toast staying on screen for **161 ms**. The "Routes exported as JSON" toast from the Export button
displays normally. Neither `pnpm smoke` nor the unit tests notice.

## Ticket
> **RIQ-151** QA: "After Optimize the success message blinks. Sometimes I can't read it. Screen-reader users may not hear it either."
> Find the root cause. Fix it with a regression test that fails on `main`.

## Constraints
- Write the failing component test first (it needs J2's DOM project). The test must fail on `main` for the right reason.
- The fix stays inside `Toast.tsx`. Don't change the store API or the auto-dismiss/exit timings.
- Keep what the component deliberately does: the per-toast `key` animation, the exit transition, the action button that dismisses
  before running (Undo on the driver screen).

## Definition of done
- A written causal chain from "Optimize clicked" to "card removed at about 200 ms" that names the exact state and timer involved.
- The regression test is red on `main` and green with the fix. The Export-toast behaviour is unchanged.
- The probe shows the toast visible for about 3.7 s.
- A note on why the smoke run missed it, plus one smoke assertion that would have caught it.

## Explain before touching
1. `shown` and `prevToast` are adjusted **during render** ("derived state"). Draw a timeline of `toast`, `shown` and `prevToast`
   from page mount to 400 ms after the first toast.
2. The effect has two branches. Which branch runs on the very first mount, when `toast` is `null`, and what does it schedule?
3. Why does the Export toast behave differently from the Optimize toast? What else happens in the same few hundred milliseconds
   after Optimize (`DriverRoutes` loads dnd-kit on desktop, the map re-fits, and so on)?
4. Is this a React bug, a misuse, or both? What would convince you either way?

<details><summary>Hints</summary>

Instrument before you theorise. Put `console.log` in the render body, in each effect branch and in each timer callback, run
`next dev`, and click Optimize. Then try to make the bug go away with the smallest possible change and see which change does it.
</details>

Sealed answer: `training/_answers/ladder-M2.md`
