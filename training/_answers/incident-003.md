# INC-003 answer: `showModal()` → `show()`

## Root cause
`DriverDialog` opens the native `<dialog>` with `show()` (non-modal) instead of `showModal()`. Everything the component's own comment
said the platform provided is gone:
| Lost with `show()` | Report it explains |
|---|---|
| **Escape → `cancel` event.** Non-modal dialogs don't get the Escape close request, and `onCancel` never fires | D2: Esc doesn't close the fail sheet |
| **Inert background.** Page content behind stays focusable, and is scanned by switch access and read by TalkBack's virtual cursor | D3: switch scanning walks the page. The ops lead: TalkBack reads the card behind |
| **Top layer.** It now depends on `z-50` stacking. It works by luck of DOM order | (latent) |
| **`:modal` / real modality.** `aria-modal="true"` now **lies** to AT, promising modality the page doesn't enforce | TalkBack confusion |
The component's Tab-wrap handler only catches Tab **while focus is inside the panel**. It doesn't stop AT virtual cursors or switch
scanning, and it doesn't make the background inert.

## Diagnostic path
1. Keyboard repro on `/driver/D1`: focus "Failed", press Enter (the sheet opens), press Escape (nothing happens). The probe
   (`--only=sheet`) automates this: `main` → `{"closedByEscape":true,"focusReturned":true,"modal":true}`. The branch → `{"closedByEscape":false,"focusReturned":false,"modal":false}`
   (both measured 2026-09-24, production builds).
2. DevTools → Elements: `main`'s `<dialog>` shows the `#top-layer` badge. The branch's doesn't. `document.querySelector('dialog[open]').matches(':modal')`
   is `true` vs `false`.
3. The diff is one line. The comment in the PR claims the custom code "covers the rest". Test that claim against the list above.

## Fix
Revert to `showModal()`. Then solve the original QA problem (the Undo toast hidden behind a modal sheet) properly:
- **Option A (chosen):** portal the toast into the open `<dialog>` while a sheet is open. `DriverDialog` provides a
  `ToastHost` element through context, and `Toast` uses `createPortal` into it when one exists. It's inside the modal subtree, so it's
  visible **and** interactive, and the live region stays persistent (render an always-mounted host in the panel).
- **Option B:** `popover="manual"` on the toast container plus `showPopover()`. It paints above the modal, but an element outside a
  modal dialog's subtree is **inert** while the modal is open, so the Undo button would be visible and unclickable. Verify this in
  Chrome before you consider it. That's the trap to name in the interview.
- **Option C (reject):** close the sheet before showing an Undo toast. That's already the flow for Delivered/Failed. The QA case was the
  details sheet, so C changes UX to hide a z-index problem.

## Regression tests
- e2e (smoke or probe): open each driver sheet with the keyboard, assert `dialog[open]:modal`, press Escape, assert it closed and focus
  returned to the opener. That is exactly `frontend-probe.mjs --only=sheet`. Add it to the smoke run.
- Component tests (jsdom) are weak here: jsdom's `<dialog>` modality and `inert` support are incomplete. Use a real browser for this invariant.

## Model postmortem
- **Impact:** keyboard, switch and screen-reader drivers couldn't dismiss sheets or were confused by background content for about 1 day.
  Some delivery outcomes were delayed.
- **Why review passed it:** the diff removed a platform guarantee and replaced it with a *claim* in a comment. The reviewer checked
  the visible behaviour with a mouse, and the smoke run closes sheets with buttons.
- **Action items:** a keyboard-path smoke step per sheet. A code-owner rule: any change to `DriverDialog`'s open mechanism needs an
  a11y reviewer. Document "prefer top-layer primitives (dialog, popover) over z-index" in FIRST_CHANGE.
