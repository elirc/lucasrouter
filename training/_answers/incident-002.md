# INC-002 answer: live region mounted with its content

## Root cause
`ceb3572` moved `role="status" aria-live="polite" aria-atomic` from the **always-mounted** container onto the card, and added
`if (!shown) return null`. So:
1. When idle, there's no live region in the DOM at all.
2. When a toast arrives, the region and its text are inserted **in the same mutation**. Screen readers track changes *inside* regions
   they already know about. A region that appears already filled has no "change" to announce in most AT/browser pairs
   (NVDA+Chrome, VoiceOver+Safari). Some announce role=status on insertion, some don't, and it varies by version. That's why "sometimes
   the first one works".
3. `key={shown.id}` makes it worse: every new toast **remounts** the card, so even back-to-back toasts get a brand-new region each time.

## Why every gate stayed green
axe checks that ARIA is *valid* (a `role="status"` with content is valid). It can't check timing relative to content. Lighthouse runs
axe. The smoke run checks visible text. No test asserted that the region exists **before** the message.

## Diagnostic path a senior takes
1. Diff the accessibility tree over time, not a snapshot. The probe marks every `[aria-live]/[role=status]` element before the action,
   then checks where the toast text lands. On `main`: `{"inLiveRegion":true,"regionExistedBefore":true}`. Run it on this branch:
   `{"inLiveRegion":true,"regionExistedBefore":false,"visibleMs":180}` (measured 2026-09-24). The region only appears with the toast.
   (`visibleMs` of ~160–180 ms on both builds is the separate, pre-existing M2 bug. Don't conflate the two.)
2. Confirm with DevTools → Accessibility pane: idle `/dispatch` on `main` shows a `status` node under the body, and the branch shows none.
3. Read the diff with that rule in mind: the conditional return plus the role move on a keyed element.

## Fix
Restore the persistent region: keep `role="status" aria-live="polite" aria-atomic="true"` on the outer container, which is **always
rendered** (drop the early `return null`). Render the card inside it. If the empty fixed layer bothered someone, it's
`pointer-events-none` and has no size. That's harmless.

## Regression test (component, J2 setup)
```tsx
render(<Toast />);
const region = screen.getByRole('status');                 // exists while idle
expect(region).toBeEmptyDOMElement();
act(() => useAppStore.getState().showToast('Moved 120 King St → Maria', 'success'));
expect(region).toHaveTextContent('Moved 120 King St');      // same node, now filled
```
This fails on the branch at the first `getByRole` (no region while idle).

## Same pattern elsewhere on `main` (a real bug, not seeded)
`src/components/dispatch/StopSearch.tsx`: `<p role="status">{n} stops found</p>` renders only while `filtering`, so the first count
after typing isn't reliably announced. Fix: an always-mounted status element above the results that's empty when not filtering.

## Model postmortem
- **Impact:** screen-reader users (dispatchers and drivers) got no confirmation for moves, optimize, delivery and Undo for about 30 h.
  The drivers' **Undo** is announced only through the toast, so they couldn't discover it at all.
- **Detection:** customer report. No automated signal exists for "announced".
- **Root cause:** a refactor changed *when* the live region exists. Reviewers checked *that* the role exists.
- **Action items:** (1) the component test above in CI. (2) The e2e probe check `regionExistedBefore` in the smoke run. (3) A lint/review
  rule: `aria-live`/`role=status|alert` must not be inside a conditional or keyed element (a custom ESLint rule or a PR checklist). (4) Fix
  the `StopSearch` instance. (5) Add an NVDA pass to the release checklist (M3).
