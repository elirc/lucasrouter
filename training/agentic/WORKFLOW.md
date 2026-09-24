# Agentic workflow: ladder M1 (marker-click INP) run through an agent loop

Why this ticket: performance work is where agents most often produce **plausible, unmeasured** changes. They add `memo` everywhere, claim
"significantly faster", and ship nothing you can verify. You own the spec and the measurement. The agent types.

Central reference: [curriculum 05, verifying code you didn't write](../../../opusorganize/apprenticeship/curriculum/05-verify-before-trust.md)
(from this repo: `C:\Users\Owner\Desktop\opusorganize\apprenticeship\curriculum\05-verify-before-trust.md`).

## Step 0: baseline (you, 30 min)
Build `main`, run `node frontend-probe.mjs http://localhost:3111 base --only=clicks` three times at `--cpu=1` and three at `--cpu=4`.
Save the medians. Record a React Profiler session in `pnpm dev`: click 5 markers, then export the JSON.

## Step 1: spec + design note (you, 45 min). No agent yet
Write `training/_work/M1-spec.md`:
- Goal with numbers (p75 < 200 ms at 1×, ≥ 50% cut at 4×) and the exact probe command that judges it.
- **Causal hypothesis** from your Profiler trace: which components render per click and why (parent re-render vs subscription).
- Allowed changes (for example: narrower subscriptions, memoized rows, stable callbacks) and forbidden ones (no virtualization, no
  library swap, no behaviour change to list↔map sync or sheet snapping).
- The tests that must stay green, and one new test (component or store) that locks the change in.

## Step 2: implementer agent
Prompt it with your spec **verbatim** plus: "Make one commit per causal change. After each commit, run `pnpm verify`. Do not claim a
performance number you didn't measure. Say 'unmeasured' instead."

## Step 3: adversarial reviewer (a different model if available)
Prompt: "Review this diff against the spec. Only correctness, architecture, performance (including new costs such as memo comparisons
and extra subscriptions), accessibility regressions (focus, scrollIntoView, live regions), tests and failure handling. No style
comments. For every claim in the PR description, find the code or measurement that proves it, or mark it UNSUPPORTED."

## Step 4: revision
The implementer addresses each review item or argues against it in writing. You decide the disputes.

## Step 5: verification (you)
Use the checklist below, and re-run the probe yourself. Agent-reported numbers don't count.

## Step 6: your explanation, graded
Write about 300 words: what re-rendered before, what re-renders now, why, and what the next bottleneck is (Leaflet popup work? `autoPan`?).
The reviewer grades it against `training/_answers/ladder-M1.md`: mechanism named (0–3), numbers reproducible (0–3), trade-offs
honest (0–2), next bottleneck identified (0–2).

---
## Checklist for verifying AI output (use it every time)
- [ ] I ran `pnpm verify`, `pnpm build` and `pnpm smoke` myself, and they're green.
- [ ] I read the **whole** diff. Every changed line maps to a sentence in the spec.
- [ ] Every performance claim has a command, a machine and a before/after median I reproduced. Anything else is deleted from the PR text.
- [ ] No placeholder behaviour: no `// TODO`, no `if (process.env.NODE_ENV === 'test')` short-circuits, no disabled checks, no `eslint-disable`
      that wasn't there before.
- [ ] Memoization has a reason: for every new `memo`/`useMemo`/`useCallback`, I can name the render it prevents and show it in the Profiler.
- [ ] Behaviour is preserved: a map click still expands and scrolls the row, the phone sheet still snaps to `half`, and keyboard focus isn't lost.
- [ ] No new persisted fields, or if there are, `PERSISTED_KEYS`/guards/`PERSIST_VERSION` are handled and old blobs still load
      (the migration is reversible, or drops only re-derivable data).
- [ ] The a11y surface is unchanged or better (a quick keyboard pass on what was touched).
