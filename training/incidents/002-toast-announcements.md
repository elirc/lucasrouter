# INC-002 · "The app stopped talking to me"

**Branch:** `training/incidents/002-toast-announcements` · **Severity:** Sev-3 (accessibility regression, customer-reported)

## Alert / report
Zendesk #4471, from a dispatcher at Badger Parcel who uses NVDA 2025.3 + Chrome:
> "Since Tuesday's update I get no confirmation after I move a stop or press Optimize. Before, NVDA said *Moved 120 King St to Maria*.
> Now it's silent, and I have to tab through the whole route list to check that the move happened."

Sighted users see the toasts normally. Nothing in the error logs.

## What CI and QA saw
```
pnpm verify        typecheck ✓  eslint --max-warnings=0 ✓  vitest 162 passed
pnpm smoke         56/56 PASS
axe DevTools       /dispatch after a move: 0 violations related to status messages
Lighthouse a11y    /dispatch 96 (unchanged)
```

## Timeline
- Tue 10:02: deploy `ceb3572` "refactor(Toast): render nothing when idle; status role on the card itself".
- Wed 15:40: ticket #4471 opened. Support reproduced it with NVDA: toast visible, no speech.
- Wed 16:05: support tried VoiceOver on macOS Safari. Speech was also missing for most toasts, though "sometimes the first one after a reload works".

## Suspect PR diff (`ceb3572`)
```diff
--- a/src/components/ui/Toast.tsx
+++ b/src/components/ui/Toast.tsx
@@ -70,11 +70,11 @@ export function Toast({ bottomOffset = 0 }: ToastProps) {
   const tone: ToastTone = shown?.tone ?? 'info';
   const Icon = TONE_ICON[tone];

+  // Nothing to show: render nothing, so idle screens carry no empty fixed layer.
+  if (!shown) return null;
+
   return (
     <div
-      role="status"
-      aria-live="polite"
-      aria-atomic="true"
       className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
@@ -82,6 +82,10 @@
       {shown && (
         <div
           key={shown.id}
+          // The card is the status message: icon, text and action are announced together.
+          role="status"
+          aria-live="polite"
+          aria-atomic="true"
           className={cn(
```
PR review comment at the time: *"LGTM, role is still there, and axe is happy."*

## Your job
1. Reproduce it without a screen reader. What can you observe in the DOM or the accessibility tree (DevTools → Accessibility pane, or
   `training/tools/frontend-probe.mjs --only=toast`) that differs between `main` and this branch?
2. Explain the mechanism, and why axe, Lighthouse and the smoke run all stayed green.
3. Fix it, with a test that would fail on this branch (component test, see ladder J2), and search the codebase for the same pattern elsewhere.
4. Write a short postmortem: impact, detection gap, action items.

Sealed answer: `training/_answers/incident-002.md`
