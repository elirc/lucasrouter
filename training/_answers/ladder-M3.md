# M3 reference: accessibility audit

## Explain-before-touching: reference answers
1. Leaflet renders each marker as an `<img>`/div with `tabindex="0"` when `keyboard` is on (`StopMarker.tsx`), in **data order**
   (`stops` order, not route order), before the panel's controls. Enter fires `click`, which opens the popup. The popup renders into
   Leaflet's separate **popup pane**, which isn't after the marker in the DOM, so Tab from the marker goes to the next marker, not into
   "Reassign to…". Measured below.
2. Live regions on `main`: `Toast` (persistent container, good. The M2 bug makes its content vanish), `PanelHeader` status line
   (`aria-live="polite"`, persistent), `PanelHeader` error (`role="alert"`, mounted with its text, and alerts are usually announced on
   insertion, so that's acceptable), `StopSearch` "N stops found" (`role="status"` **mounted with its text**, a finding),
   `UnassignedSection` count (persistent), `RouteLegend` (persistent), `DriverHeader` progress (persistent), `DispatchSkeleton`/`MapSkeleton`/
   `DriverPicker` loading states (`role=status` + `aria-busy`, fine).
3. The "⋯" `MoveStopMenu` ("Move to top / end / another driver") is a keyboard and single-pointer alternative to dragging, so it
   satisfies 2.5.7 Dragging Movements *for moving between drivers and to the ends*. It doesn't offer "move to position k" (drag can),
   so arbitrary reordering has **no** non-drag equivalent. That's a partial finding.
4. **axe can prove:** missing names or labels, invalid ARIA, contrast of rendered text, landmark and heading structure, and target
   size (partly). **Only a human can prove:** that announcements are actually spoken (timing, the M2/INC-002 class), a sensible focus
   order through the map, focus return after sheets, whether a 3.5 s Undo is usable, and the reflow and zoom experience.

## axe + keyboard results on `main` (measured 2026-09-24, axe-core 4.10.2, production build)
Harness: puppeteer + `axe.run` with tags wcag2a/2aa/21aa/22aa + best-practice, after each state change.
| State | 390×844 | 1366×850 |
|---|---|---|
| `/` landing | **color-contrast (serious) ×13** (e.g. `.home-footnote`, `.preview-summary span`) | **color-contrast ×14** |
| `/dispatch` before Optimize | target-size (serious) ×19 (stop markers) | color-contrast ×2 (`.overview-heading p`, overview card detail) + target-size ×13 |
| `/dispatch` after Optimize | target-size ×19 | target-size ×13 |
| `/driver` | none | none |
| `/driver/D1` | region (moderate) ×2 (header text outside landmarks) | region ×2 |
| `/driver/D1` + Delivered sheet | none | none |

The landing's contrast failures come from the rebuild's `home.css` palette (small grey-green text such as `#7c8978`/`#788676` on the
light background). DECISIONS #44's "landing a11y 100" predates the rebuild, so **the docs are stale**. That's a finding in itself.

Keyboard (desktop, after Optimize, Tab from the top): **116 Tab presses to reach "Export JSON"**. That's 46 marker tab stops (45 stops +
the depot), plus the map container, plus **each route polyline `<path class="leaflet-interactive">`** is focusable, with no name.
Then Enter on a focused stop marker **didn't open the popup** in headless Chrome, and the next Tab went to the next marker. Confirm this
by hand in headed Chrome before filing it (keypress synthesis differs in headless), but either way the popup isn't in the Tab path.

## Reference findings table (top items; WCAG 2.2)
| # | Finding | SC | Severity | Evidence | Fix ticket |
|---|---|---|---|---|---|
| 1 | Toast text disappears after ~161 ms, so the announcement is unreliable and Undo is unreachable | 4.1.3, 2.2.1 | High | probe `visibleMs`, ladder M2 | M2 |
| 2 | Undo toast auto-dismisses in 3.5 s, with no pause on focus or hover | 2.2.1 | High | `Toast.tsx` `AUTO_DISMISS_MS` | pause-on-focus + ≥ 10 s for actionable toasts |
| 3 | The search result count is not reliably announced (the region mounts with its text) | 4.1.3 | Medium | `StopSearch.tsx` | persistent status element |
| 4 | Map markers: 45 tab stops, and the popup is unreachable by Tab | 2.4.3, 2.1.1 | Medium | keyboard run below | single map tab stop + "selected stop" DOM panel, or move focus into the popup on open |
| 5 | No non-drag way to put a stop at an arbitrary position | 2.5.7 | Medium | `MoveStopMenu.tsx` options | "Move to position…" item |
| 6 | Pointer-only instruction "Select a marker to view details" | 1.3.3 (sensory), 3.3.2 | Low | `DispatchScreen.tsx` map label | "Select a stop on the map or in the list" |
| 7 | Dense 28 px markers overlap | 2.5.8 | Low | DECISIONS #44 | cluster at low zoom, or larger hit areas |
| 8 | Landing text contrast (13–14 nodes) | 1.4.3 | Medium | axe table above | darken `home.css` secondary text to ≥ 4.5:1 |
| 9 | Unnamed focusable polylines add tab stops | 2.4.3, 4.1.2 | Low | keyboard run | `interactive: false` / `keyboard: false` on route paths, or give them names |
| 10 | Driver header text outside landmarks | best-practice (1.3.1) | Low | axe `region` | wrap in `<header>`/`<main>` |

## Rubric
axe on all listed states (2) · keyboard run with concrete repro steps (3) · a live-region timing analysis (2) · correct WCAG mapping (1) · ≥ 3 well-formed fix tickets (2).
