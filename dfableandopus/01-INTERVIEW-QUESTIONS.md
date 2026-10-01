# Interview questions: RouteIQ

Every technical answer below cites a real file and line. Difficulty is marked junior or mid.

## Screening

**S1 (junior). Describe the data model in one minute.**
Four entities in `src/lib/types.ts`: `Stop` (`src/lib/types.ts:46`) with an id like `S001`, lat/lng, `packages`, a `Priority`, an optional `timeWindow`, a `StopStatus` of `pending | delivered | failed`, and an optional `proof`. `Driver` (`src/lib/types.ts:63`) carries a vehicle, a hex colour used for map routes, a `shiftStart` and `capacityPackages`. `Depot` (`src/lib/types.ts:72`) is a singleton whose id is the literal `'DEPOT'`. `DeliveryProof` (`src/lib/types.ts:18`) is all-optional except `at`, because the fast path records only `{ method: 'handed', at }`.

**S2 (junior). Why is there both `Stop.proof` and a separate `deliveryLog`?**
`DeliveryEvent` (`src/lib/types.ts:33`) is a denormalised append-only log. The comment above it says why: the log has to still read correctly after the dispatcher re-optimizes or a stop is undone, so it copies the outcome rather than pointing at the stop's current status. It also stores `hasPhoto?: boolean` (`src/lib/types.ts:43`) instead of the image, so the log stays small while the picture lives once on `Stop.proof`.

**S3 (junior). Where does user input get validated?**
`src/lib/deliveryValidation.ts`. `sanitizeDeliveryProof` (`src/lib/deliveryValidation.ts:29`) is the boundary for driver-supplied proof, and `isFailureReason` (`src/lib/deliveryValidation.ts:13`) guards the failure path. The HTTP boundary is separate: `POST /api/optimize` parses with Zod at `src/app/api/optimize/route.ts:178`.

**S4 (mid). Walk the request path for "driver taps Delivered".**
The driver component calls the store action `recordDelivery` (`src/store/useAppStore.ts:898`). It looks up the stop and returns `{ ok: false, photoDropped: false }` if the id is unknown (`src/store/useAppStore.ts:901`). It sanitizes the caller's proof (`src/store/useAppStore.ts:905`), decides the photo budget (`src/store/useAppStore.ts:909-910`), builds the stored proof, builds exactly one `DeliveryEvent`, and does a single `set()` that flips the status and appends the event (`src/store/useAppStore.ts:931-936`). Persistence to localStorage happens in the store's subscription, not in the component.

**S5 (mid). Why validate in the store rather than in the form component?**
Four actions mutate delivery state: `recordDelivery`, `recordFailure` (`src/store/useAppStore.ts:940`), `undoStop` (`src/store/useAppStore.ts:965`) and `deferStop` (`src/store/useAppStore.ts:982`). Validating in one form only protects one caller. The store is the single mutation boundary, so a guard there covers hydrated state, cross-tab writes and any future component.

**S6 (junior). What does TypeScript not protect you from here?**
Types constrain code the team compiles. They do not constrain a stale persisted blob, a browser extension, a test calling through `as never`, or hand-written JavaScript. The store test proves the point by calling `recordDelivery` with `method: 'invalid' as never` (`tests/store.test.ts:506`).

**S7 (mid). How is the app persisted, and what is the failure mode?**
A versioned JSON blob in localStorage, read at hydration and re-applied from `storage` events for cross-tab sync (`tests/store.test.ts:240`). The failure mode is last-writer-wins plus a browser quota, which is exactly why the photo budget exists at `src/store/useAppStore.ts:520` (`PHOTO_BUDGET_BYTES = 1_500_000`).

## Deep dive

**D1 (mid). The change you made: what was wrong before?**
Before, `recordDelivery` trimmed text and stored whatever proof object the caller handed it. A `method` outside the four-value union, a non-string `recipientName`, a 700-character note or a `https://` "photo" were all persisted. The fix routes the input through `sanitizeDeliveryProof` (`src/store/useAppStore.ts:905`), which drops unknown methods (`src/lib/deliveryValidation.ts:33`), coerces non-strings to `undefined` in `cleanText` (`src/lib/deliveryValidation.ts:17-21`), and only accepts a photo matching `/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+=*$/i` (`src/lib/deliveryValidation.ts:40`).

**D2 (mid). Why drop bad fields instead of rejecting the whole call?**
Two different kinds of input. Optional decoration (name, note, photo) is dropped so the driver's actual job still completes. A domain choice is a precondition: `recordFailure` returns `false` and mutates nothing when `isFailureReason(reason)` is false (`src/store/useAppStore.ts:942`), before any setter runs. The store test asserts both halves in one case: the delivery survives with a 500-character note while the bad failure reason leaves the stop `pending` and the log at length 1 (`tests/store.test.ts:511-519`).

**D3 (mid). Explain the photo budget decision and defend it.**
`photoDropped` is computed from the bytes already in use plus this photo against `PHOTO_BUDGET_BYTES` (`src/store/useAppStore.ts:909-910`). If over budget, the stop is still marked delivered, the event is still appended, but `stored.photo` is never set (`src/store/useAppStore.ts:917`) and `event.hasPhoto` stays absent (`src/store/useAppStore.ts:929`). The action returns `{ ok: true, photoDropped: true }` so the caller can toast. Refusing the delivery would block real work for a cosmetic limit. The strong version of this answer names the trade-off: the driver's evidence is silently weaker unless the UI actually surfaces the flag, so the flag is a contract the caller must honour.

**D4 (mid). What breaks if you delete `src/lib/deliveryValidation.ts:39`, the `.trim()` on the photo?**
Camera and copy-paste inputs arrive with surrounding whitespace, so the strict pattern at line 40 no longer matches and a legitimate photo is dropped. `tests/delivery-validation.test.ts:30` fails: it asserts `'  data:image/png;base64,QUJD  '` sanitizes to the trimmed data URL. Nothing else fails, which is why this was a real fix-pass regression rather than an obvious bug.

**D5 (mid). What breaks if you remove `if (!stop) return ...` at `src/store/useAppStore.ts:901`?**
The `set()` at line 931 maps over `s.stops` and matches nothing, so no stop changes, but the `DeliveryEvent` at line 919 is still appended, with a `driverId` resolved from a route that does not contain the stop. You get an orphan log entry that the day report and CSV export read as a real delivery. The guard converts a silent data-integrity bug into a `{ ok: false }` the UI can explain.

**D6 (mid). Why does `deferStop` deliberately not set `editedSinceOptimize`?**
The comment at `src/store/useAppStore.ts:988-993` states it: a driver skipping their own stop is not the dispatcher editing the plan by hand, and the dispatcher panel used to claim it was. `deferStop` reuses `planAfterMove` so ETAs and metrics stay consistent, and returns `false` when the stop is already last (`src/store/useAppStore.ts:995`). `tests/store.test.ts:588` locks the behaviour in.

**D7 (mid). Contrast the client validator with the API's Zod schema.**
`sanitizeDeliveryProof` is coercive: it returns a narrowed object and never throws. The `/api/optimize` schema is rejecting: `safeParse` fails and the handler returns 400 with a compact `{ path, message }` issue list (`src/app/api/optimize/route.ts:179-184`, `toIssues` at line 160). The API also adds cross-field rules a per-field sanitizer cannot express: `superRefine` rejects duplicate stop and driver ids (`src/app/api/optimize/route.ts:135-152`) because the optimizer's "every stop exactly once" invariant depends on uniqueness.

**D8 (mid). Why are there request size caps on a demo endpoint?**
`MAX_STOPS = 1000` and `MAX_DRIVERS = 50` at `src/app/api/optimize/route.ts:64-65`, with the comment explaining the optimizer builds a dense n x n matrix and runs O(n^2)-O(n^3) local search per driver on a public endpoint. There are also value caps (`MAX_PACKAGES_PER_STOP`, `MAX_CAPACITY`, `MAX_SERVICE_MINUTES`, lines 71-73) because a schema-valid request could otherwise produce `NaN:NaN` ETAs or `totalMinutes: 1e308`.

**D9 (junior). Why does the optimize handler catch JSON parse errors separately?**
`await request.json()` throws on a malformed body, and an uncaught throw would be a 500. The handler wraps it and returns 400 with `issues: []` (`src/app/api/optimize/route.ts:169-176`), so a client bug never looks like a server bug.

**D10 (mid). The 500 branch returns `err.message`. Is that safe?**
It returns the message, not the stack, and the comment at `src/app/api/optimize/route.ts:193` says so explicitly. For validated input it should be unreachable. The honest answer names the residual risk: an optimizer message could still leak an internal detail, so in a real service I would log the error with a correlation id and return a generic string plus that id.

## Behavioral (STAR)

**B1 (mid). Tell me about a time you found a risk nobody had reported.**
Situation: RouteIQ persisted driver proof directly to localStorage. Task: no bug ticket existed; the types looked complete. Action: I wrote a store test calling `recordDelivery` with values TypeScript would reject (`tests/store.test.ts:505-510`) and watched a 700-character note and an `https://` photo persist. I then put `sanitizeDeliveryProof` at the store boundary rather than in the form. Result: the case now asserts the note is bounded at 500 characters and the method and photo are absent (`tests/store.test.ts:512-514`), and the full suite runs 167 tests green with typecheck and `eslint --max-warnings=0` at exit 0.

**B2 (junior). Tell me about a time you chose not to block the user.**
Situation: photos are data URLs inside a localStorage blob with a finite budget. Task: decide what happens when a delivery's photo will not fit. Action: I kept the delivery and dropped only the picture, returning `photoDropped` so the driver gets a toast (`src/store/useAppStore.ts:937`). Result: `tests/store.test.ts:486` asserts the second delivery still reaches `delivered` with `proof.photo` undefined and `hasPhoto` absent, and the decision is written down in `astraupskill/VERIFICATION.md` so the next reader does not "fix" it back into a hard failure.

**B3 (mid). Tell me about feedback that changed your code.**
Situation: review flagged that my photo-budget test hard-coded the byte size. Task: make the test survive a change to the constant. Action: the test now imports `PHOTO_BUDGET_BYTES` from the store and builds the oversized payload from it (`tests/store.test.ts:490-491`). Result: the constant and the test cannot drift; the same review pass also added the whitespace-trim case at `tests/delivery-validation.test.ts:29`, and both landed in the run that reported 167 passing tests across 7 files.

**B4 (mid). Tell me about a build you could not get green.**
Situation: the production build failed in the Turbopack PostCSS transform on an extended Windows dependency path. Task: ship a real build, not a skipped one. Action: I reproduced with the Webpack path, which compiled and then surfaced a genuine TypeScript narrowing error in the validator, fixed that, and scoped Tailwind source discovery to `src` via `source("../")` in `src/app/globals.css` so course snapshots stopped contributing utility classes. Result: the final `pnpm build` exits zero in 120.6 seconds, and the alternate `build:webpack` script stays documented as an option rather than as the evidence.

**B5 (junior). Describe your verification habit.**
I record commands, exit codes and durations rather than expected numbers. For this project that is 166 unit tests plus 56 browser smoke checks at delivery, 167 after the review pass, typecheck exit 0 in 75 seconds, lint exit 0, build exit 0, smoke passing all 56 checks with no console errors and only app-origin plus OpenStreetMap tile requests. When something is not covered I say so: the smoke suite is not an accessibility or cross-browser audit.

## Follow-ups an interviewer asks next

**F1. "Your validator accepts any base64 data URL. What does that actually guarantee?"**
Structure and size policy only. It does not decode pixels, verify the MIME type is truthful, or screen the media. The bytes are re-rendered in an `<img>` in the driver UI, so a mislabelled payload is a rendering failure rather than a store failure, and on a real server this check would have to be redone after decoding.

**F2. "You bound the note at 500. Where does that number live and what breaks if it changes?"**
`MAX_NOTE_LENGTH` at `src/lib/deliveryValidation.ts:6`, private to that module. Changing it breaks `tests/delivery-validation.test.ts:21` and `tests/store.test.ts:522`, and it would not retroactively shorten notes already in a persisted blob. That is the migration question: old data is grandfathered unless hydration re-sanitizes.

**F3. "If the client validator can be bypassed, why keep it?"**
It keeps the state model stable for the UI and the CSV export, and it keeps the persisted blob inside quota. It is not a security control here because there is no server to protect. That is the sentence to say out loud.

**F4. "Add a fifth delivery method. What do you touch?"**
The union at `src/lib/types.ts:8`, the `METHODS` set at `src/lib/deliveryValidation.ts:3`, the form option, and both label maps in `src/components/driver/report.ts:9` and `:17`. Missing the label maps is the realistic failure: the form accepts the value while the CSV header row and the day summary do not render it.

**F5. "Two tabs are open and both record a delivery. What happens?"**
Last writer wins. The store re-applies another tab's persisted slice from the `storage` event without echoing it back (`tests/store.test.ts:240`) and refuses blobs from a different build or with an unrenderable event type (`tests/store.test.ts:274`, `:685`), but there is no merge. Fixing it properly means a server with per-event ids and an append endpoint, not a smarter client.

**F6. "What would you test next that you have not?"**
Hydration re-sanitization. Today the validator runs on new writes; a blob written by an older build can still carry an overlong note. A test that hydrates a hostile blob and asserts bounded fields would close the loop.
