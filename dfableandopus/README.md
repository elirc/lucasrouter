# RouteIQ interview kit

RouteIQ is a Next.js App Router delivery dispatch demo: a dispatcher screen plans routes over a map, a driver screen records proof of delivery, and a Zustand store in `src/store/useAppStore.ts` owns every mutation and persists to localStorage. The astraupskill course teaches the codebase; this folder turns the same code into hiring material for CRUD web-app roles on Next/React/TypeScript.

## The pitch

"I added a runtime validation boundary to a delivery app whose domain types were doing no work at runtime. Delivery proof (method, recipient name, note, photo) flowed from a driver form straight into a Zustand store and then into localStorage, so a stale form, a JavaScript caller or a browser extension could persist anything. I put `sanitizeDeliveryProof` in front of the store mutation instead of in the component, so all four driver actions benefit, and I kept the existing photo byte budget as the last guard. The store now returns `{ ok: true, photoDropped: true }` when the picture will not fit, so the delivery still counts and the driver is told. 167 unit tests and 56 browser smoke checks pass, with typecheck and zero-warning lint."

## Target stacks

Primary: TypeScript + React + Next.js App Router, client state, Zod at HTTP boundaries (`src/app/api/optimize/route.ts` is the real Zod example). The store actions map cleanly onto service-layer methods, so the same answers translate to Node/Express or ASP.NET Core if a panel asks; say "store action" where they say "service method".

## Two-week plan

- Days 1-3: read [01-INTERVIEW-QUESTIONS.md](01-INTERVIEW-QUESTIONS.md) screening group out loud with the source open; you must be able to name the file that validates before you answer anything else.
- Days 4-6: deep-dive group, plus [03-CODE-READING-DRILL.md](03-CODE-READING-DRILL.md) drills 1-3 under a timer.
- Days 7-8: rehearse [02-STORIES-AND-RESUME.md](02-STORIES-AND-RESUME.md) until the 60-second summary needs no notes, and cut the resume bullets into your CV.
- Days 9-11: do [04-TAKE-HOME.md](04-TAKE-HOME.md) end to end against the real test suite, then grade yourself with its rubric.
- Days 12-13: [05-SYSTEM-DESIGN-FOLLOWUPS.md](05-SYSTEM-DESIGN-FOLLOWUPS.md); the honest answers here start with "today it is browser-local, so".
- Day 14: [06-FLASHCARDS.md](06-FLASHCARDS.md) twice, plus drills 4-6.
