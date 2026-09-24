# Review comparison: mine vs reference

Fill this in *after* writing `training/_work/review-mine.md`, then open `training/_answers/review.md`.

| # | Reference finding (title) | Severity | Did I find it? (yes / partly / no) | If partly or no: what I'd have needed to look at |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| … | | | | |

## Findings I had that the reference doesn't
| My finding | Evidence | Is it real? (verify now) |
|---|---|---|

## Pattern behind my misses
Tick the ones that apply, and add a sentence of evidence for each tick.
- [ ] I read code but didn't **run** it (runtime-only bugs: the toast, INP, and the live regions)
- [ ] I trusted comments and docs (this repo has very persuasive comments; check at least 3 against behaviour)
- [ ] I reviewed only one viewport (mobile and desktop mount different trees: `BottomSheet` vs `<aside>`)
- [ ] I didn't use the keyboard or a screen reader
- [ ] I didn't check the docs' numbers against a fresh measurement
- [ ] I ranked by "code smell" instead of production impact

## One habit to change in the next review
>
