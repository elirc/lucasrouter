# J4 · The driver's Undo disappears before a keyboard user can reach it

**Rung:** junior · **Time:** 2–3 h · **Skills:** WCAG 2.2.1 Timing Adjustable, timers in React effects, focus/hover events, component tests with fake timers
**Prerequisites:** J2 (component-test project) and M2 (the vanishing-toast fix) are merged, because this ticket edits the same effect in `Toast.tsx`.
Added in B08 to fill a gap: every accessibility item in this lab was mid-level (M3) or an incident. This is the first junior a11y ticket, and it
turns M3's ranked finding #2 (`_answers/ladder-M3.md`) and review finding #5 (`_answers/review.md`) into work.

## Context
`src/components/ui/Toast.tsx` auto-dismisses **every** toast after `AUTO_DISMISS_MS = 3500`. The driver app puts its only mis-tap recovery in a
toast: after Delivered or Failed, `DriverRouteScreen.tsx` calls `showToast(…, { label: 'Undo', onAction: () => undoFromToast(stopId) })`
(DECISIONS #50). A sighted mouse user has 3.5 s to tap Undo. A keyboard or switch user must first move focus to the toast. A screen-reader user
first hears the message, then has to find the button. In 3.5 s, that often fails. Hovering or focusing the toast doesn't pause the timer.

## Ticket
> **RIQ-165** Accessibility review (from the M3 audit): "Actionable toasts must give people enough time. Give toasts that carry an action at least
> 10 s, pause the countdown while the pointer is over the toast or focus is inside it, and resume when both leave. Plain toasts keep 3.5 s."

## Constraints
- The change stays inside `Toast.tsx`. The store API (`showToast(message, tone, action)`, `dismissToast()`) doesn't change.
- The outer `role="status"` container stays **always mounted** (incident 002). Don't move the live region.
- Keep `EXIT_MS`, the per-toast `key` animation, and "the action dismisses before it runs".
- The toast container is `pointer-events-none` and the card is `pointer-events-auto`. Put hover handlers on the card.
- No new dependencies.

## Definition of done
- Component tests (J2's DOM project, fake timers):
  1. A plain toast is gone after 3,500 + 200 ms (unchanged).
  2. A toast with an action is still visible at 9,900 ms and gone after 10,000 + 200 ms.
  3. With an action toast showing, focus the Undo button at 2,000 ms and advance 30 s: still visible. Blur it: the toast is dismissed after
     the remaining time (state in the test name whether you restart or resume, and justify it in the PR).
  4. The same for `mouseenter`/`mouseleave` on the card.
- A new toast arriving while the old one is paused starts its own fresh countdown (it doesn't inherit the pause).
- `pnpm verify` green. A keyboard pass on `/driver/D1`: Delivered → Tab to Undo → wait 15 s → Enter restores the stop.

## Explain before touching
1. Read WCAG 2.2.1. Which of its options (turn off, adjust, extend) does "pause while focused or hovered + 10 s" use? Why doesn't a plain
   "Routes ready" toast need the same treatment?
2. In `Toast.tsx`, which effect owns the auto-dismiss timer, and what are its dependencies? If you add `paused` state, what happens to
   the timer each time `paused` flips?
3. `focus`/`blur` don't bubble, but React's `onFocus`/`onBlur` do (they map to `focusin`/`focusout`). Why does that matter when focus moves
   from the Undo button to the Dismiss button inside the same card?
4. Where does focus go after Undo? (`undoFromToast` in `DriverRouteScreen.tsx`, DECISIONS #50.) Could your pause logic keep a toast alive
   forever after the card is gone?
5. Is a 10 s toast a problem anywhere else? (Think about the dispatcher's toasts and about toasts covering the driver's bottom bar, via
   `bottomOffset`.)

<details><summary>Hints</summary>

- Track the remaining time, not just a boolean: `remainingRef` set when the countdown starts, reduced by the elapsed time on pause.
- `onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) resume(); }}` ignores focus moving between buttons in the card.
- Test focus with `@testing-library/user-event` or `fireEvent.focus` on the button found by `getByRole('button', { name: 'Undo' })`.
</details>

Sealed answer: `training/_answers/ladder-J4.md`
