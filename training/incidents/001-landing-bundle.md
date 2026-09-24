# INC-001 · The landing page got heavier, and nobody touched the map

**Branch:** `training/incidents/001-landing-bundle` · **Severity:** Sev-4 (performance budget regression on the marketing entry point)

## Alert
Build-output check (scripts referenced by the server HTML of `/`, i.e. what must download and run before the landing hydrates) plus the
lab probe (production build, 390×844, 4× CPU, same laptop, same session):

| Build | hydration-critical JS on `/` (raw / gzip) | scripts | total JS fetched by `/` incl. idle prefetch (probe) | `/` FCP (median of 3) |
|---|---|---|---|---|
| `main` (fafe0c7) | 591 KB / 184 KB | 9 | 609 KB | 1,380–2,260 ms (varies by session) |
| `4c9f7e1` | **619 KB / 194 KB** | **10** | 615 KB | 1,440 ms |

The on-call engineer's first comment: *"Total JS barely moved (+6 KB). Probably noise. Close it?"*

> Growth marketing: "The landing page is where ads land. We made it static on purpose (DECISIONS #34, the comment in `layout.tsx`).
> The PR says it only added a number. Is the page still static?"

## Timeline
- Thu: deploy `4c9f7e1` "feat(landing): live delivered-today counter in the numbers strip". CI (`pnpm verify`) green. The smoke run's
  landing checks passed.

## Suspect PR diff (`4c9f7e1`)
```diff
 // src/app/page.tsx
 import { Logo } from '@/components/ui/Logo';
+import { LandingProgress } from '@/components/LandingProgress';
 …
-        <section className="home-numbers" aria-label="Demo fleet"><div><strong>45</strong>…<div><strong>1</strong><span>connected workspace</span></div>…
+        <section className="home-numbers" aria-label="Demo fleet"><div><strong>45</strong>…<LandingProgress />…

 // src/components/LandingProgress.tsx (new, 24 lines)
+'use client';
+import { useMemo } from 'react';
+import { useAppStore, useHasHydrated } from '@/store/useAppStore';
+export function LandingProgress() {
+  const hydrated = useHasHydrated();
+  const stops = useAppStore((s) => s.stops);
+  const delivered = useMemo(() => stops.filter((s) => s.status === 'delivered').length, [stops]);
+  return (<div><strong>{hydrated ? delivered : '—'}</strong><span>delivered today</span></div>);
+}
```

## Your job
1. Explain why the two JS columns disagree: +28 KB in one, +6 KB in the other. Which one matters for this page, and why? (Hint: what do the
   `<Link href="/dispatch">` and `<Link href="/driver">` on the landing page do in a production build?)
2. Prove what the new critical bytes are. Name the modules, not just the total. Use the build output (`.next/`), DevTools → Network, or both.
3. Beyond bytes: what does this component **run** on the landing page at load that wasn't running before? (Read the store module's
   top-level statements.)
4. Fix it so the counter stays and the landing page stays static and light. Give two designs and pick one.
5. Propose the gate that fails this PR in CI (see ladder M4). Why would a "total JS" budget have missed it?

Sealed answer: `training/_answers/incident-001.md`
