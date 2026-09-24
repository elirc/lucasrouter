# INC-003 · Drivers "stuck" in the delivery sheets

**Branch:** `training/incidents/003-driver-sheet-keyboard` · **Severity:** Sev-2 (drivers can't complete stops with a hardware keyboard or a switch device)

## Alert / report
Three reports within one shift, all from the driver app (`/driver/[id]`):
> Driver D2 (tablet in a cradle, Bluetooth keyboard): "Esc doesn't close the *Why did this fail?* box anymore. I have to reach over and tap outside."
> Driver D3 (switch access, Android): "After I open *Stop details* my switch scanning goes through the whole page behind it. It takes 40 presses to get back to the buttons."
> Ops lead: "A driver said TalkBack read the next stop card's text while the Delivered sheet was open. Is that sheet even open?"

## Signals
```
pnpm verify    ✓        pnpm smoke     56/56 PASS  (the smoke run clicks with a mouse and closes the sheets with their buttons)
Vercel logs    no new errors (the app has no client error reporting)
Browser console (driver's tablet, via remote debugging): clean
```
Chrome DevTools → Elements on the branch, with the Failed sheet open:
```
<dialog open aria-modal="true" aria-labelledby=":r1:" class="fixed inset-0 z-50 m-0 …">
```
The same on `main`, same state:
```
<dialog open aria-modal="true" aria-labelledby=":r1:" class="fixed inset-0 z-50 m-0 …">   #top-layer
```

## Timeline
- Mon 09:12: deploy `20f0177` "fix(driver): keep the Undo toast visible above open sheets", in reply to QA's report that the Undo toast
  was hidden behind an open sheet.
- Mon 11:30: the first driver report.

## Suspect PR diff (`20f0177`)
```diff
--- a/src/components/driver/DriverDialog.tsx
+++ b/src/components/driver/DriverDialog.tsx
@@ -119,8 +119,10 @@ function DialogPanel({ onClose, title, description, children, className }: DriverDialogProps) {
     const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

-    // Top layer + inert background + native focus containment.
-    if (!dialog.open) dialog.showModal();
+    // Non-modal on purpose: a top-layer modal sits above every z-index, which
+    // hid the store Toast (and its "Undo" action) behind the sheet's backdrop.
+    // Our own backdrop, scroll lock and Tab wrap below already cover the rest.
+    if (!dialog.open) dialog.show();
```

## Your job
1. Reproduce each of the three reports with the keyboard only. The probe's `--only=sheet` automates one of them. Which one?
2. List **everything** the old line gave you that the new one doesn't, and map each loss to one of the reports.
3. Fix the original QA problem (Undo toast hidden behind an open sheet) **without** giving up modality. Give two options and pick one.
4. Postmortem: why did review accept "our own backdrop, scroll lock and Tab wrap already cover the rest"? What test would have stopped it?

Sealed answer: `training/_answers/incident-003.md`
