# M3 · Accessibility audit: axe + keyboard-only + screen-reader pass

**Rung:** mid · **Time:** 1 day (audit) + fixes as follow-up tickets · **Skills:** WCAG 2.2 AA, axe-core, keyboard navigation of a map UI,
focus management, live regions, contrast

## Context
DECISIONS #44 reports Lighthouse a11y 96 on `/dispatch` and 100 elsewhere. The code has a lot of deliberate a11y work: native
`<dialog>` sheets with focus return (`DriverDialog.tsx`), a roving-focus menu (`MoveStopMenu.tsx`), a `role="status"` toast, contrast
notes in `Toast.tsx` and `StopRow.tsx`. Lighthouse runs a subset of axe on one viewport and one state. It doesn't press Tab, doesn't
listen to a screen reader, and doesn't open popups.

## Ticket
> **RIQ-160** A logistics customer's procurement team needs a VPAT-style statement for the dispatcher and driver apps. Produce an
> audit, not fixes: every finding with WCAG criterion, severity, evidence (file:line or a screenshot), and a proposed fix ticket.

## Scope (all of these)
1. **axe-core** on `/`, `/dispatch` (before and after Optimize, at 390 px and 1366 px), `/driver`, `/driver/D1` (with the Delivered sheet
   open). Inject `axe.min.js` with puppeteer (`page.addScriptTag`), or use the browser extension.
2. **Keyboard only** (unplug the mouse): run the whole dispatcher day. Optimize, find stop S017 (5301 High Crossing Blvd) on the map, reassign it to another driver,
   hide a driver's route, export. Then run the driver flow: Delivered with proof, Failed with a reason, Skip, Undo from the toast.
   Record every trap, lost focus, invisible focus and unreachable control.
3. **Screen reader** (NVDA + Chrome, or Narrator): are route updates announced after Optimize, a move, a search, and a delivery?
4. **Contrast**: toast tones, the 11 px status line in `PanelHeader`, marker sequence numbers (`onColor` in `src/lib/color.ts`), and the
   legend chips.

## Definition of done
- `training/_work/a11y-audit.md` (your file): a findings table, the raw axe JSON per state, and a list of keyboard-flow failures with repro steps.
- At least 3 fix tickets written in this ladder's template, ranked. The live-region and map-keyboard findings must be among them.

## Explain before touching
1. The map has 45 Leaflet markers with `keyboard` enabled (`StopMarker.tsx`). What is the Tab order across them, and how does a keyboard
   user get from a marker into its popup's "Reassign to…" `<select>`?
2. Which UI regions announce changes (grep `aria-live`, `role="status"`, `role="alert"`)? For each one, is the region in the DOM **before**
   its text changes?
3. What is the keyboard-accessible alternative to dragging a stop (`DriverRoutesDnd.tsx`)? Is it a real equivalent (WCAG 2.5.7)?
4. What can axe prove, and what can only a human prove? Give two examples of each from this app.

<details><summary>Hints</summary>

`axe.run(document, { runOnly: ['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice'] })`. Run it again after each state change,
because a popup or sheet adds new DOM.
</details>

Sealed answer: `training/_answers/ladder-M3.md`
