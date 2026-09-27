# J4 reference: actionable toast timing (added in B08)

Status: reasoned design, **not executed** (docs-only pass, no dependencies installed). Check it against your own green tests.

## Explain-before-touching: reference answers
1. It uses **extend/pause**: the user controls the countdown by keeping focus or the pointer on the toast, and the base time is longer. 2.2.1 applies
   to time limits on content the user must **act on** or read. The plain "Routes ready" toast carries no action, and its information stays
   available elsewhere (the panel's "Optimized 9:41 AM" line in `PanelHeader.tsx`, the routes themselves), so 3.5 s is acceptable once M2 is fixed.
   The Undo toast is the **only** way to revert a mis-tap (DECISIONS #50), so its time limit blocks a task.
2. The effect `useEffect(() => { if (toast) { setTimeout(dismissToast, AUTO_DISMISS_MS) … } }, [toast, dismissToast])` (after M2 it's
   split into a dismiss effect and an exit effect). If you add `paused` to its dependencies, **every flip restarts the full timer**, which turns
   "resume" into "restart". That's legal only if you say so. For true resume, keep the remaining milliseconds in a ref.
3. React's `onFocus`/`onBlur` bubble, so the card's handlers see focus moving from Undo to Dismiss as blur-then-focus. Without the
   `relatedTarget` check, the countdown resumes for an instant and can fire in between, especially with fake timers in tests.
4. `undoFromToast` restores the stop and moves focus to the restored card. The action already calls `dismissToast()` first, so the store's
   `toast` becomes `null` and the timer effect cleans up. The risk is a paused flag that survives: if `paused` stays `true` and the next toast
   inherits it, that toast never dismisses. Reset `paused` (and the remaining time) whenever `toast.id` changes.
5. On the driver screen, a 10 s toast sits above the bottom bar (`bottomOffset`) for longer, but it doesn't cover the primary action by design.
   The dispatcher's action-less toasts are unaffected. Watch for stacking: a second Undo toast replaces the first (one toast at a time), so the
   first stop's Undo becomes unreachable. That's worth a follow-up ticket (toast queue), not part of J4.

## Reference change (sketch, inside `Toast.tsx`)
```tsx
const ACTION_DISMISS_MS = 10_000;
const [paused, setPaused] = useState(false);
const remainingRef = useRef(0);
const startedRef = useRef(0);

// New toast → fresh budget, never inherits a pause.
const [budgetFor, setBudgetFor] = useState<number | null>(null);
if (toast && toast.id !== budgetFor) {
  setBudgetFor(toast.id);
  setPaused(false);
  remainingRef.current = toast.action ? ACTION_DISMISS_MS : AUTO_DISMISS_MS;
}

useEffect(() => {
  if (!toast || paused) return;
  startedRef.current = Date.now();
  const t = setTimeout(dismissToast, remainingRef.current);
  return () => {
    clearTimeout(t);
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedRef.current));
  };
}, [toast, paused, dismissToast]);
```
On the card: `onMouseEnter={() => setPaused(true)}`, `onMouseLeave={resumeIfFocusOutside}`, `onFocus={() => setPaused(true)}`,
`onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(hovering) }}`. Track hover in a ref, so leaving with the
mouse while focus is still inside keeps the pause. (Vitest fake timers also fake `Date.now()` by default, so the remaining-time math works in tests.)

## Tests (component project from J2)
- Plain toast: `advanceTimersByTime(3500 + 200)` → the card is gone. The region `getByRole('status')` still exists (a guard for incident 002).
- Action toast: visible at 9,900 ms, gone after 10,200 ms.
- Focus pause: `showToast('Delivered · 120 King St', 'success', { label: 'Undo', onAction })` → advance 2,000 → focus Undo → advance 30,000
  → still visible → blur to `document.body` → advance 8,000 + 200 → gone (resume semantics: 10,000 − 2,000 remaining).
- Hover pause: the same with `fireEvent.mouseEnter`/`mouseLeave` on the card.
- New toast while paused: pause the first, `showToast` a second action toast, advance 10,200 → the second is gone (it didn't inherit the pause).

## Rubric (10)
WCAG reasoning names 2.2.1 and why plain toasts are exempt (2) · resume vs restart decided and tested explicitly (2) · focus moving inside the card
doesn't resume (`relatedTarget`) (2) · new toast resets the pause (1) · live region untouched and asserted (1) · keyboard pass on `/driver/D1` done
by hand (2).
