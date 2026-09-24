# Project stories (STAR). Complete these **after** doing the work

Each skeleton names the real artifact. Fill in S/T/A/R with what *you* did and measured. Numbers you didn't produce yourself don't go in.
For the runtime-validation story (delivery proof sanitizer), use the existing kit in `dfableandopus/02-STORIES-AND-RESUME.md`.

## 1. Debugging: "The toast that lived 161 ms" (ladder M2)
- **S:** RouteIQ dispatcher. After Optimize, the success toast flashed. No test failed, and the smoke run passed.
- **T:** find the cause without guessing, and lock it in with a test that fails on `main`.
- **A:** _(your instrumentation: render/effect/timer logs; the smallest change that made it disappear; the failing test)_
- **R:** _(visible time before/after from the probe; what the test asserts; what you told the team about render-phase derived state)_
- Follow-up they'll ask: "Why didn't the smoke run catch it?"

## 2. Performance with numbers: marker-click INP (ladder M1)
- **S:** p75 click ~230 ms at 1× / ~1.1–1.5 s at 4× on `/dispatch` (Event Timing, production build).
- **T:** under 200 ms without virtualization or a library swap.
- **A:** _(Profiler finding: which subscriptions and parent re-renders; the 2–3 PR-sized changes)_
- **R:** _(a before/after table; what you didn't do and why; the next bottleneck)_

## 3. Incident: a feature PR that made typing janky (incident 004)
- **S:** "Dim non-matching stops while searching" shipped green. The next day dispatchers reported laggy search on older PCs.
- **A/R:** _(how you went from symptom to a subscription at the wrong level; the fix; the regression guard)_

## 4. Accessibility: an audit that found what Lighthouse 96 didn't (ladder M3)
- **S:** a procurement request for a VPAT. Lighthouse reported 96–100.
- **A/R:** _(axe states you covered; keyboard-only failures; live-region timing; which findings became tickets; your one-sentence
  explanation of why a score isn't an audit)_

## 5. Agent-caught / agent-introduced bug (agentic workflow on M1)
- **S:** an implementer agent proposed `memo` on N components.
- **A/R:** _(what the adversarial reviewer or your checklist caught: an unmeasured claim, a memo that added cost, a broken
  scrollIntoView; how you decided)_
