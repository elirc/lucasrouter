# On-ramp: 10 warm-ups before `training/`

Do these before any ladder ticket or incident. Each takes 5–20 minutes. **Predict first, write your prediction down, then check** (in the
code, a Node REPL, the browser console, or a test). Sealed answers: `learn/_answers/00-onramp.md`. Open them only after you've written
all your answers for a group (1–5, then 6–10).

Read the committed version of a file with `git show HEAD:<path>` if your working copy has uncommitted changes. Exercises 8 and (optionally) 2
run code: `pnpm install --frozen-lockfile` first. Exercise 1 can also be checked without installing anything:
`node --experimental-strip-types -e "import('./src/lib/time.ts').then(t => console.log(t.to12h('25:13')))"` (Node 22.6+; `time.ts` has no imports).

---

## 1. Predict the output: time formatting (`src/lib/time.ts`)
Read `parseHHMM`, `formatHHMM`, `formatDuration` and `to12h`. Write down what each call returns (or whether it throws):
```ts
formatHHMM(1513)
formatHHMM(-20)
formatDuration(75)
formatDuration(60)
to12h('00:30')
to12h('12:00')
to12h('25:13')
to12h('9:5')
parseHHMM('9:5')
```
Then answer: why does `to12h` catch the error from `parseHHMM` instead of letting it throw? (Read its doc comment and think about what
renders an ETA.)

## 2. Read a component and predict what the screen says (`src/components/dispatch/DispatchOverview.tsx`)
The seed has 45 stops. At 4 pm, 31 are `delivered`, 2 are `failed`, 12 are `pending`. Write the exact `value` and `detail` text of the
"Delivered" card. Is the detail true for the ops lead? Which line computes it?
Then: this component is only visible on desktop. Which CSS rule hides it on phones, and in which file? (Hint: `.dispatch-overview`.)

## 3. Trace one request end to end: Optimize (no code changes)
Fill in the blanks, naming the file and function for each step. Use `training/navigation/ARCHITECTURE.md` §3A only to check yourself afterwards.
1. The button lives in `____` and calls `useAppStore.____()`.
2. The store sends `POST ____` with a timeout of `____` ms.
3. The route handler parses the body with `____` and validates it with `____`.
4. Back in the store, the response shape is checked by `____`.
5. The success message is shown by `____('Routes ready · …')`.

Then predict three failure cases by reading `optimize()` in `src/store/useAppStore.ts`:
- (a) `/api/optimize` answers **500**. What does the user see? Where does the plan come from?
- (b) The user double-clicks Optimize. What happens on the second call?
- (c) The API takes 10 s. What happens at 8 s?

## 4. Persisted or ephemeral? (`PERSISTED_KEYS` in `src/store/useAppStore.ts`)
For each field, say whether it survives a reload and is broadcast to other tabs, and **why that's the right choice**:
`selectedStopId`, `toast`, `isOptimizing`, `hiddenDriverIds`, `deliveryLog`, `lastOptimizedAt`.
Bonus: `isOptimizing` is ephemeral. Describe the concrete bug a user would hit if someone added it to `PERSISTED_KEYS`. (Read the first
lines of `optimize()`.)
Bonus 2: what stops you from adding a key to `PERSISTED_KEYS` and forgetting its guard? (Look at the type of `PERSISTED_GUARDS`.)

## 5. Which selectors are safe? (the "SELECTOR NOTE" at the top of `src/store/useAppStore.ts`)
zustand 5 uses React's `useSyncExternalStore`. For each line, say: fine, re-renders too often, or breaks (and how):
```ts
const stops = useAppStore((s) => s.stops);                                    // (a)
const byId  = useAppStore(selectStopsById);                                   // (b)
const pending = useAppStore((s) => s.stops.filter((x) => x.status === 'pending')); // (c)
const isMine = useAppStore((s) => s.selectedStopId === stopId);               // (d)
const selectedStopId = useAppStore((s) => s.selectedStopId);  // (e) written inside DispatchScreen
```
For (e): it's legal. What's the cost? Which child components re-render on every map click because of it?

## 6. Server vs client components (`src/app/layout.tsx`, `src/app/page.tsx`)
1. Is `src/app/page.tsx` a server or a client component? How do you tell from the file alone?
2. Read the comment at the end of `layout.tsx`. What exactly would end up in **every** page's JavaScript if `<Toast />` were rendered there?
3. `src/components/map/MapView.tsx` loads Leaflet with `next/dynamic(..., { ssr: false })`. Name one thing that would break, and one thing
   that would get slower, if `MapViewInner` were imported statically instead.

## 7. Explain the API contract (`src/app/api/optimize/route.ts`)
Read `optimizeRequestSchema` and `POST`. For each request body, predict the HTTP status and, for 400s, the `error` text:
- (a) a valid request, but one stop has `id: "DEPOT"`
- (b) 1,001 stops
- (c) a stop with `timeWindow: { start: "10:00", end: "09:00" }`
- (d) a valid request where one stop has an extra field `"color": "red"`
- (e) a driver with `shiftStart: "24:00"`
- (f) the body is the text `hello`
- (g) a valid JSON body sent with `Content-Type: text/plain`
Which one of these surprises you most? (Keep your answer to (g). Ladder J3 builds on it.)

## 8. Write one characterization test (`src/lib/time.ts` → `tests/`)
`tests/time.test.ts` covers `formatWindow` for same-day windows and `to12h` for next-day times ("25:13" → "1:13 AM +1"), but never
`formatWindow` with **both** ends past midnight.
1. Predict `formatWindow({ start: '24:30', end: '25:00' })` by reading the code (follow `split(' ')` carefully).
2. Write a test in a **new** file `tests/time-characterization.test.ts` that pins what the code does **today**, even if you think it's wrong.
   Name the test so a reader knows it describes current behaviour, not desired behaviour.
3. Run it: `pnpm exec vitest run tests/time-characterization.test.ts`. Then break `formatWindow` on purpose (for example, always return the
   full strings) and confirm your test goes red. Revert.
4. Decide: is this a bug users can hit today? (Where do time windows come from, and what does the API allow for their hours?)
See curriculum 04 (portfolio apprenticeship curriculum, not in this repo) for why you pin before you fix.

## 9. Find the live region (`src/components/ui/Toast.tsx`)
Answer from the code, then confirm in Chrome DevTools → Accessibility pane on an idle `/dispatch` (production or dev build):
1. Which element has `role="status"` and `aria-live="polite"`?
2. Is that element in the DOM **when no toast is showing**? Why does that matter to a screen reader?
   (curriculum 11 (portfolio apprenticeship curriculum, not in this repo), check 3.)
3. Why does the card carry `key={shown.id}`? What happens to the card DOM node when a second toast replaces the first?
4. The action button calls `dismissToast()` **before** `run?.()`. What bug does that order prevent?

## 10. Two trees, one screen (`src/components/dispatch/useIsDesktop.ts`, `DispatchScreen.tsx`)
1. What does `useIsDesktop()` return on the server, during the hydration render, and right after mount on a 1366 px screen?
2. Why is it built on `useSyncExternalStore` instead of `useState` + `useEffect`? (Read its doc comment.)
3. `fitKey` in `DispatchScreen.tsx` includes `isDesktop`. What visible thing happens when you resize the window across 768 px, and why is
   that on purpose?
4. Name the component that exists only on phones and the one that exists only on desktop. Why does this mean every UI change must be
   tested at two viewports (`training/navigation/FIRST_CHANGE.md` #1)?

---
**Done when:** you have written answers for all 10, at least 8 match the sealed answers in substance, and exercise 8's test is green on
`main` and red when you break the function. Then start session 5 in `learn/README.md`.
