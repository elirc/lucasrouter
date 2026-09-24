# INC-005 answer: content inserted above the map after first paint

## Root cause
`OptimizerStatus` renders `null` until `/api/health` resolves, then inserts a ~36 px (`min-h-9`) row **between the app bar and the
map** in a `flex h-dvh flex-col` layout. Everything below it (the map container, the legend chip, the label, and on phones the whole
map area) shifts down after it has been painted. Layout-shift score = impact fraction × distance fraction. Measured in the lab: CLS **0 → 0.04** at 390×844.
Why treat 0.04 as a regression even though it's under 0.1 "good":
- the page's design contract was **0** (the skeletons mirror the final layout), so this is a new class of shift, not noise;
- only content that has already *painted* counts as shifted. In the lab the fetch resolves while the map is still mostly the
  placeholder. On a slow network `/api/health` lands after tiles and markers paint, the impact fraction approaches the whole map, and
  the score grows. Meanwhile the dispatcher's finger is already moving towards the Legend chip (the misclick report);
- CLS is a session metric in the field. Every other late insertion (toasts are fixed, so those are fine, but future strips aren't)
  adds to the same budget.
On desktop, `DispatchOverview` sits between the strip and the map too, and it moves as well. Mobile hides the overview
(`dispatch.css` `display:none`), so the map itself is the shifted element.

## Why tests can't see it
The unit tests don't lay anything out. The smoke run asserts content (markers, text), not geometry over time. No lab-vitals gate exists
(ladder M4/S2).

## Diagnostic path
Probe CLS (`main` 0 vs branch, in the brief) → DevTools Performance → Layout Shift track → click the shift: the sources are
`main[aria-label="Route map"]` and its descendants → the diff: a conditionally rendered row above them, gated on a fetch.

## Fix options
- **A (chosen):** reserve the space from the first render. Render the strip immediately with a neutral "Checking optimizer…" state
  and the same `min-h-9` height, and swap the text when the fetch resolves. Zero shift, and no SSR change (the page is static; the text
  is client-only).
- **B:** overlay instead of flow. Put the strip `absolute` over the top of the map (like `dispatch-map-label`), so there's no layout impact.
  It costs 36 px of map on phones.
- **C:** move it out of the critical area, into the panel footer next to Export (`DispatchActions`). It's zero risk and less visible.
Also: announce "Optimizer unreachable" via a *persistent* status region if ops wants SR users to know (INC-002 lesson).

## Guard
The probe's CLS on `/dispatch` at 390 px in CI, failing above 0.02 (`main` is 0). An e2e assertion that the map container's `top` is
the same at first paint and after `networkidle`.

## Postmortem essentials
Impact: CLS on every `/dispatch` load, plus misclicks (the Legend chip moved under the finger). Lesson: **anything that appears
asynchronously must have its box reserved before first paint**, or it must not be in flow.
