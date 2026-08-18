/**
 * End-to-end smoke test against a running server (default http://localhost:3000)
 * using a local Chrome/Edge via puppeteer-core (no browser download).
 *
 *   pnpm build && pnpm start          # production build (timings are measured
 *                                     # against it; `pnpm dev` works but is slower)
 *   pnpm smoke [baseUrl]              # = node scripts/smoke-e2e.mjs [baseUrl]
 *
 * Prerequisites: a local Chrome or Edge (auto-detected in the usual install
 * locations) or `CHROME_PATH=/path/to/chrome`. No browser is downloaded.
 *
 * Walks the acceptance criteria: 45 grey stops + depot on /dispatch (markers
 * within 2 s of navigation start, measured in-page with `performance.now()`
 * against a warmed server), optimize → 3 routes + before/after metrics with
 * optimized km < baseline, manual reassignment updates metrics and persists to
 * /driver/[id], the driver flow at 375×812 (delivered → proof sheet → confirm,
 * failed with a reason + note, skip to the end of the route, the activity log,
 * the end-of-day report, progress survives a reload, no horizontal scroll),
 * a driver arriving before anyone optimized (the route prepares itself),
 * desktop dispatch, legend/export/reset, the JSON API (400 on invalid input),
 * no unexpected network hosts (own origin + OSM tiles only), and no console
 * errors. Plus regression checks: an accidental double-tap on Delivered marks
 * one stop, two driver tabs do not ping-pong localStorage writes, done stops
 * cannot be moved, the route-complete card, and real 404s for unknown routes /
 * drivers.
 *
 * Screenshots land in ./e2e-screens/ (git-ignored; the curated set lives in
 * docs/screenshots/). Every failed check is printed as FAIL; the process exits
 * non-zero when any check failed or the run crashed.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const OUT = path.resolve('e2e-screens');
fs.mkdirSync(OUT, { recursive: true });

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
if (!executablePath) {
  console.error('No local Chrome/Edge found; set CHROME_PATH');
  process.exit(2);
}

const MOBILE = { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { width: 1366, height: 850, deviceScaleFactor: 1 };

let failures = 0;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(page, fn, { timeout = 15000, label = 'condition' } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn)) return true;
    await sleep(150);
  }
  throw new Error(`timeout waiting for ${label}`);
}

const consoleErrors = [];
const requestHosts = new Set();

async function newPage(browser, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    try {
      requestHosts.add(new URL(r.url()).host);
    } catch {
      /* ignore */
    }
  });
  return page;
}

const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('routeiq-v1') ?? '{}').state ?? null);
const stopMarkerCount = (page) => page.evaluate(() => document.querySelectorAll('.riq-stop-icon').length);
const clickByText = async (page, selector, text) => {
  const handle = await page.evaluateHandle(
    (sel, txt) => [...document.querySelectorAll(sel)].find((el) => el.textContent?.trim().includes(txt)) ?? null,
    selector,
    text,
  );
  const el = handle.asElement();
  if (!el) throw new Error(`no ${selector} containing "${text}"`);
  await el.click();
};

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
try {
  // ------------------------------------------------------------- landing
  {
    const page = await newPage(browser, MOBILE);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
    const text = await page.evaluate(() => document.body.innerText);
    check('landing shows both role cards', /Open Dispatcher/.test(text) && /Open Driver App/.test(text));
    const manifest = await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute('href'));
    check('manifest link present', manifest === '/manifest.webmanifest', String(manifest));
    const viewport = await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute('content'));
    check('viewport meta has viewport-fit=cover', /viewport-fit=cover/.test(viewport ?? ''), String(viewport));
    await page.screenshot({ path: path.join(OUT, '01-landing-mobile.png') });
    await page.close();
  }

  // ------------------------------------------------------------- dispatch (mobile)
  const page = await newPage(browser, MOBILE);
  // Warm-up: the very first request to a freshly started `next start` pays for
  // loading the route modules and the map chunk once; the spec's 2 s budget is
  // about the app, not the server's cold start, so load /dispatch once, then
  // wipe the demo state and measure the second (cold-storage) load.
  await page.goto(`${BASE}/dispatch`, { waitUntil: 'domcontentloaded' });
  await waitFor(page, () => document.querySelectorAll('.riq-stop-icon').length === 45, { label: 'warm-up markers' });
  await page.evaluate(() => localStorage.clear()); // fresh demo state, same origin
  await page.goto(`${BASE}/dispatch`, { waitUntil: 'domcontentloaded' });
  // Measured IN the page from navigation start (performance.now() is relative
  // to the document's timeOrigin), polled every 25 ms so the granularity is
  // negligible.
  await page.waitForFunction(() => document.querySelectorAll('.riq-stop-icon').length === 45, {
    polling: 25,
    timeout: 15000,
  });
  const loadMs = Math.round(await page.evaluate(() => performance.now()));
  check(
    'dispatch: 45 stop markers within 2 s of navigation start (warm server, empty storage)',
    loadMs < 2000,
    `${loadMs} ms`,
  );
  check('dispatch: depot marker present', (await page.evaluate(() => document.querySelectorAll('.riq-depot-icon').length)) === 1);
  const greyCount = await page.evaluate(
    () => [...document.querySelectorAll('.riq-stop-icon')].filter((el) => el.innerHTML.includes('#94a3b8')).length,
  );
  check('dispatch: all 45 stops grey before optimizing', greyCount === 45, `${greyCount} grey`);
  const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('dispatch mobile: no horizontal scroll', !hScroll);
  await page.screenshot({ path: path.join(OUT, '02-dispatch-mobile-before.png') });

  // Optimize
  await clickByText(page, 'button', 'Optimize routes');
  await waitFor(page, () => /Optimized/.test(document.body.innerText) && !/Optimizing/.test(document.body.innerText), {
    label: 'optimize done',
  });
  await sleep(500);
  const st = await store(page);
  check('optimize: 3 routes', st?.routes?.length === 3, JSON.stringify(st?.routes?.map((r) => r.stopIds.length)));
  const assigned = st?.routes?.flatMap((r) => r.stopIds) ?? [];
  check('optimize: all 45 stops assigned exactly once', new Set(assigned).size === 45 && assigned.length === 45, `${assigned.length}`);
  check(
    'optimize: optimized km < baseline km',
    st?.optimizedMetrics?.totalDistanceKm < st?.baselineMetrics?.totalDistanceKm,
    `${st?.optimizedMetrics?.totalDistanceKm} vs ${st?.baselineMetrics?.totalDistanceKm}`,
  );
  check('optimize: algorithm nn-2opt-v1', st?.algorithm === 'nn-2opt-v1', st?.algorithm);
  check(
    'optimize: violations displayed and >= 0',
    typeof st?.optimizedMetrics?.timeWindowViolations === 'number' && st.optimizedMetrics.timeWindowViolations >= 0,
    String(st?.optimizedMetrics?.timeWindowViolations),
  );
  const coloured = await page.evaluate(
    () => [...document.querySelectorAll('.riq-stop-icon')].filter((el) => !el.innerHTML.includes('#94a3b8')).length,
  );
  check('map: markers coloured after optimize', coloured === 45, `${coloured} coloured`);
  const polylines = await page.evaluate(() => document.querySelectorAll('path.leaflet-interactive').length);
  check('map: route polylines drawn', polylines >= 3, `${polylines} interactive paths`);
  const bodyText = await page.evaluate(() => document.body.innerText);
  check('metrics: Before/After card visible', /Baseline/.test(bodyText) && /Optimized/.test(bodyText));
  await page.screenshot({ path: path.join(OUT, '03-dispatch-mobile-after.png') });

  // Expand sheet to see metrics + driver cards
  const sheetHandle = await page.$('[data-handle]');
  if (sheetHandle) {
    await sheetHandle.click();
    await sleep(350);
    await sheetHandle.click();
    await sleep(350);
  }
  await page.screenshot({ path: path.join(OUT, '04-dispatch-mobile-sheet-full.png') });

  // Manual reassignment via the ⋯ menu: move first stop of D1 to D2
  const before = await store(page);
  const d1First = before.routes[0].stopIds[0];
  const menuBtn = await page.$(`button[aria-label^="Move "]`);
  check('reassign: move menu button exists', Boolean(menuBtn));
  if (menuBtn) {
    // Find the menu button belonging to d1First's row.
    const rowBtn = await page.evaluateHandle((id) => {
      const row = document.querySelector(`[data-stop-id="${id}"]`);
      return row?.querySelector('button[aria-label^="Move "]') ?? null;
    }, d1First);
    const el = rowBtn.asElement();
    check('reassign: menu button for D1 first stop found', Boolean(el));
    if (el) {
      await el.evaluate((b) => b.scrollIntoView({ block: 'center' }));
      await el.click();
      await sleep(250);
      await clickByText(page, '[role="menuitem"]', 'Luis Ortega');
      await sleep(400);
      const after = await store(page);
      check('reassign: stop moved D1 → D2', after.routes[1].stopIds.includes(d1First) && !after.routes[0].stopIds.includes(d1First));
      check(
        'reassign: metrics recomputed',
        after.optimizedMetrics.totalDistanceKm !== before.optimizedMetrics.totalDistanceKm ||
          after.routes[1].totalMinutes !== before.routes[1].totalMinutes,
        `${before.optimizedMetrics.totalDistanceKm} → ${after.optimizedMetrics.totalDistanceKm} km`,
      );
      check('reassign: baseline untouched', after.baselineMetrics.totalDistanceKm === before.baselineMetrics.totalDistanceKm);
      check('reassign: still 45 assigned once', new Set(after.routes.flatMap((r) => r.stopIds)).size === 45);
    }
  }
  await page.screenshot({ path: path.join(OUT, '05-dispatch-mobile-after-move.png') });

  // ------------------------------------------------------------- driver flow (mobile), same origin storage
  const st2 = await store(page);
  const d2Route = st2.routes[1];
  await page.goto(`${BASE}/driver`, { waitUntil: 'networkidle0' });
  const pickerText = await page.evaluate(() => document.body.innerText);
  check('driver picker lists 3 drivers', /Maya Thompson/.test(pickerText) && /Luis Ortega/.test(pickerText) && /Priya Nair/.test(pickerText));
  await page.screenshot({ path: path.join(OUT, '06-driver-picker.png') });

  await page.goto(`${BASE}/driver/D2`, { waitUntil: 'networkidle0' });
  await waitFor(page, () => /NEXT STOP/i.test(document.body.innerText), { label: 'next stop card' });
  const hScroll2 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('driver mobile: no horizontal scroll', !hScroll2);
  const geom = await page.evaluate(() => {
    const vh = window.innerHeight;
    const q = (sel) => {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null;
    };
    const delivered = q('button[aria-label^="Mark "][aria-label$="delivered"]');
    const failed = q('button[aria-label^="Mark "][aria-label$="failed"]');
    const map = q('.leaflet-container');
    return { vh, delivered, failed, map };
  });
  check(
    'driver 375×812: next-stop card + both buttons + map visible without scrolling',
    geom.delivered && geom.failed && geom.map && geom.delivered.bottom <= geom.vh && geom.map.top < geom.vh,
    JSON.stringify({ vh: geom.vh, deliveredBottom: geom.delivered?.bottom, mapTop: geom.map?.top, mapBottom: geom.map?.bottom }),
  );
  check('driver: persisted reassignment reflected (D2 route has moved stop)', new RegExp(`of ${d2Route.stopIds.length} stops`).test(await page.evaluate(() => document.body.innerText)));
  await page.screenshot({ path: path.join(OUT, '07-driver-D2-mobile.png') });

  /**
   * The two-tap delivery: Delivered on the card, then the sheet's confirm with
   * the default method ("Handed to recipient"). Returns false when there is no
   * pending stop left.
   */
  const deliverCurrentStop = async () => {
    const btn = await page.$('button[aria-label^="Mark "][aria-label$="delivered"]');
    if (!btn) return false;
    await btn.click();
    await sleep(250);
    await clickByText(page, 'dialog[open] button', 'Confirm delivery');
    await sleep(450); // > ACTION_SETTLE_MS before the next card accepts input
    return true;
  };

  // Mark delivered → proof sheet → confirm → advances
  const firstStop = d2Route.stopIds[0];
  const firstAddr = st2.stops.find((s) => s.id === firstStop).address;
  const cardBefore = await page.evaluate(() => document.querySelector('[id^="next-stop-"]')?.id);
  await page.click('button[aria-label^="Mark "][aria-label$="delivered"]');
  await sleep(400);
  const sheetText = await page.evaluate(() => document.querySelector('dialog[open]')?.innerText ?? '');
  check(
    'driver: Delivered opens the proof-of-delivery sheet with a default method',
    /How was it delivered/i.test(sheetText) && /Handed to recipient/.test(sheetText),
    sheetText.split('\n').slice(0, 3).join(' / '),
  );
  await clickByText(page, 'dialog[open] button', 'Confirm delivery');
  await sleep(700); // > ACTION_SETTLE_MS: the new card ignores presses in its first 400 ms
  const cardAfter = await page.evaluate(() => document.querySelector('[id^="next-stop-"]')?.id);
  const st3 = await store(page);
  check('driver: Delivered advances to next stop', cardBefore !== cardAfter, `${cardBefore} → ${cardAfter}`);
  check('driver: status persisted as delivered', st3.stops.find((s) => s.id === firstStop)?.status === 'delivered', firstAddr);
  check('driver: progress shows 1 of N', new RegExp(`1 of ${d2Route.stopIds.length}`).test(await page.evaluate(() => document.body.innerText)));
  const proof = st3.stops.find((s) => s.id === firstStop)?.proof;
  const deliveredEvent = (st3.deliveryLog ?? []).find((e) => e.stopId === firstStop && e.type === 'delivered');
  check(
    'driver: proof of delivery + activity-log event recorded',
    proof?.method === 'handed' && typeof proof?.at === 'string' && deliveredEvent?.driverId === 'D2',
    JSON.stringify({ proof, event: deliveredEvent }),
  );

  // Failed with a reason and a free-text note
  await page.click('button[aria-label^="Mark "][aria-label$="failed"]');
  await sleep(300);
  await page.type('dialog[open] input[type="text"]', 'gate locked');
  await clickByText(page, 'dialog[open] button', 'No one home');
  await sleep(400);
  const st4 = await store(page);
  const second = d2Route.stopIds[1];
  check('driver: failed with reason persisted', st4.stops.find((s) => s.id === second)?.status === 'failed' && /No one home/.test(st4.stops.find((s) => s.id === second)?.notes ?? ''));
  const failEvent = (st4.deliveryLog ?? []).find((e) => e.stopId === second && e.type === 'failed');
  check(
    'driver: failed attempt records the note and a log event',
    failEvent?.reason === 'No one home' &&
      failEvent?.note === 'gate locked' &&
      st4.stops.find((s) => s.id === second)?.proof?.note === 'gate locked',
    JSON.stringify(failEvent),
  );
  await page.screenshot({ path: path.join(OUT, '08-driver-D2-after-actions.png') });

  // Skip for now: the current stop moves to the END of this driver's route
  // (ETAs re-scheduled) and the next one takes its place.
  const beforeSkip = await store(page);
  const skipRoute = beforeSkip.routes.find((r) => r.driverId === 'D2');
  const skipped = skipRoute.stopIds.find((id) => beforeSkip.stops.find((s) => s.id === id)?.status === 'pending');
  await clickByText(page, 'button', 'Skip for now');
  await sleep(700);
  const afterSkip = await store(page);
  const skippedRoute = afterSkip.routes.find((r) => r.driverId === 'D2');
  check(
    'driver: "Skip for now" moves the stop to the end of the route',
    skippedRoute.stopIds.at(-1) === skipped &&
      skippedRoute.stopIds.length === skipRoute.stopIds.length &&
      (afterSkip.deliveryLog ?? []).some((e) => e.stopId === skipped && e.type === 'deferred'),
    `${skipped}: index ${skipRoute.stopIds.indexOf(skipped)} → ${skippedRoute.stopIds.indexOf(skipped)}`,
  );

  // Activity log: one tap from the header, newest first.
  await page.click('button[aria-label^="Activity log"]');
  await sleep(400);
  const logText = await page.evaluate(() => document.querySelector('dialog[open]')?.innerText ?? '');
  check(
    'driver: activity log lists today’s records',
    /Activity log/.test(logText) && /Delivered/.test(logText) && /Failed/.test(logText) && /Skipped/.test(logText),
    logText.split('\n').slice(0, 4).join(' / '),
  );
  await page.screenshot({ path: path.join(OUT, '08b-driver-activity-log.png') });
  await page.keyboard.press('Escape');
  await sleep(300);

  // Refresh persistence: the statuses must come back from localStorage and the
  // header must show 2 done out of N.
  await page.reload({ waitUntil: 'networkidle0' });
  await waitFor(page, () => /NEXT STOP|Route complete/i.test(document.body.innerText), { label: 'driver screen after reload' });
  const st5r = await store(page);
  const reloadedText = await page.evaluate(() => document.body.innerText);
  const firstAfter = st5r?.stops?.find((s) => s.id === firstStop);
  const secondAfter = st5r?.stops?.find((s) => s.id === second);
  check(
    'driver: progress survives refresh (delivered + failed statuses restored, header shows 2 of N)',
    firstAfter?.status === 'delivered' &&
      secondAfter?.status === 'failed' &&
      new RegExp(`2 of ${d2Route.stopIds.length}`).test(reloadedText),
    `${firstAfter?.status} / ${secondAfter?.status}; header ${(reloadedText.match(/\d+ of \d+/) ?? ['?'])[0]}`,
  );

  // Navigate link
  const nav = await page.evaluate(() => document.querySelector('a[href^="https://www.google.com/maps/dir/"]')?.getAttribute('href'));
  check('driver: Navigate deep link present', /api=1&destination=43\./.test(nav ?? ''), nav ?? 'none');

  // Accidental double-tap on Delivered must mark ONE stop: the proof sheet
  // records nothing without an explicit confirm (the second tap lands on its
  // backdrop), and the next card's settle window (ACTION_SETTLE_MS) ignores
  // presses that land on it while it is mounting under the finger.
  const doneBefore = (await store(page)).stops.filter((s) => s.status !== 'pending').length;
  const tapAt = await page.evaluate(() => {
    const r = document.querySelector('button[aria-label^="Mark "][aria-label$="delivered"]')?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  });
  if (tapAt) {
    await page.touchscreen.tap(tapAt.x, tapAt.y);
    await sleep(120);
    await page.touchscreen.tap(tapAt.x, tapAt.y);
    await sleep(700);
  }
  const doneMid = (await store(page)).stops.filter((s) => s.status !== 'pending').length;
  check('driver: a double-tap on Delivered records nothing without a confirm', doneMid === doneBefore, `${doneBefore} → ${doneMid}`);
  if (await page.$('dialog[open]')) {
    await page.keyboard.press('Escape');
    await sleep(300);
  }
  await deliverCurrentStop();
  const doneAfter = (await store(page)).stops.filter((s) => s.status !== 'pending').length;
  check('driver: accidental double-tap on Delivered marks one stop, not two', doneAfter === doneBefore + 1, `${doneBefore} → ${doneAfter}`);

  // Two driver tabs (D2 here, D1 in a second tab) must not ping-pong writes:
  // each tab claims activeDriverId once, so this tab sees ~1 storage event.
  await page.evaluate(() => {
    window.__riqStorageEvents = 0;
    window.addEventListener('storage', () => { window.__riqStorageEvents += 1; });
  });
  const otherTab = await newPage(browser, MOBILE);
  await otherTab.goto(`${BASE}/driver/D1`, { waitUntil: 'networkidle0' });
  await sleep(2500);
  const storageEvents = await page.evaluate(() => window.__riqStorageEvents);
  check('cross-tab: two driver tabs settle (no write ping-pong)', storageEvents <= 3, `${storageEvents} storage events in 2.5 s`);
  await otherTab.close();

  // Finish the route: Delivered (+ confirm) until the route-complete card shows.
  for (let i = 0; i < 40; i++) {
    if (!(await deliverCurrentStop())) break;
  }
  const completeText = await page.evaluate(() => document.body.innerText);
  const stDone = await store(page);
  const d2Done = stDone.routes.find((r) => r.driverId === 'D2');
  check(
    'driver: route complete card after the last stop',
    /Route complete/.test(completeText) && d2Done.stopIds.every((id) => stDone.stops.find((s) => s.id === id)?.status !== 'pending'),
    (completeText.match(/\d+ of \d+ stops/) ?? ['?'])[0],
  );
  const reportUi = await page.evaluate(() => ({
    csv: [...document.querySelectorAll('button')].some((b) => /Download report/.test(b.textContent ?? '')),
    json: [...document.querySelectorAll('button')].some((b) => /Download today.s events as JSON/.test(b.getAttribute('aria-label') ?? '')),
    text: document.body.innerText,
  }));
  check(
    'driver: route complete offers the end-of-day report (CSV + JSON) with real numbers',
    reportUi.csv && reportUi.json && /TIME ON ROUTE/i.test(reportUi.text) && /SKIPPED/i.test(reportUi.text),
    (reportUi.text.match(/TIME ON ROUTE[\s\S]{0,40}/i) ?? ['?'])[0].replace(/\n/g, ' '),
  );
  await page.screenshot({ path: path.join(OUT, '08c-driver-route-complete.png') });

  // ------------------------------------------------------------- desktop dispatch
  const desk = await newPage(browser, DESKTOP);
  await desk.goto(`${BASE}/dispatch`, { waitUntil: 'networkidle0' });
  await waitFor(desk, () => document.querySelectorAll('.riq-stop-icon').length === 45, { label: 'desktop markers' });
  await sleep(600);
  const deskText = await desk.evaluate(() => document.body.innerText);
  check('desktop dispatch: side panel with metrics + drivers', /Baseline/.test(deskText) && /Maya Thompson/.test(deskText));
  const grips = await desk.evaluate(() => document.querySelectorAll('button[aria-label^="Drag to reorder"]').length);
  check('desktop dispatch: drag handles rendered', grips >= 40, `${grips} handles`);
  const doneRow = await desk.evaluate((id) => {
    const row = document.querySelector(`[data-stop-id="${id}"]`);
    const menu = row?.querySelector('button[aria-haspopup="menu"]');
    const grip = row?.querySelector('button[aria-label^="Drag to reorder"]');
    return row ? { menuDisabled: menu?.disabled ?? null, gripDisabled: grip?.disabled ?? null } : null;
  }, firstStop);
  check('desktop dispatch: delivered stop cannot be moved (menu + drag handle disabled)', doneRow?.menuDisabled === true && doneRow?.gripDisabled === true, JSON.stringify(doneRow));
  await desk.screenshot({ path: path.join(OUT, '09-dispatch-desktop.png') });

  // Legend toggle hides a driver's route
  const legendToggle = await desk.$('input[type="checkbox"]');
  if (legendToggle) {
    const beforeCount = await stopMarkerCount(desk);
    await legendToggle.click();
    await sleep(300);
    const afterCount = await stopMarkerCount(desk);
    check('legend: toggling a driver hides its stops', afterCount < beforeCount, `${beforeCount} → ${afterCount}`);
    await legendToggle.click();
  }

  // Export JSON via store method
  const exportOk = await desk.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /Export/.test(b.textContent ?? ''));
    return Boolean(btn && !btn.disabled);
  });
  check('export button enabled after optimize', exportOk);

  // Reset demo
  await clickByText(desk, 'button', 'Reset demo');
  await sleep(200);
  await desk.click('button[aria-label="Yes, reset the demo"]');
  await sleep(800);
  const st5 = await store(desk);
  check('reset demo clears routes and statuses', st5.routes === null && st5.stops.every((s) => s.status === 'pending'));
  await desk.close();

  // ------------------------------------------------------------- driver: no plan at all
  // Nothing is optimized any more (the reset above), which is exactly the
  // state a driver hits on a fresh phone: picking a name must produce a route,
  // not a "routes not optimized yet — ask dispatch" dead end.
  await page.goto(`${BASE}/driver`, { waitUntil: 'networkidle0' });
  const freshPicker = await page.evaluate(() => document.body.innerText);
  check(
    'driver picker: no-plan state promises a route instead of pointing at dispatch',
    /prepared/i.test(freshPicker) && !/ask dispatch/i.test(freshPicker),
    (freshPicker.match(/No routes[^\n]*/) ?? ['?'])[0],
  );
  await clickByText(page, 'a[href^="/driver/"]', 'Maya Thompson');
  await waitFor(page, () => /Preparing your route|NEXT STOP/i.test(document.body.innerText), {
    label: 'auto-prepare started',
  });
  await waitFor(page, () => /NEXT STOP/i.test(document.body.innerText), { label: 'auto-prepared route' });
  await sleep(400);
  const stPrepared = await store(page);
  const preparedText = await page.evaluate(() => document.body.innerText);
  check(
    'driver: a route with no plan prepares itself automatically (no dead end)',
    stPrepared.routes?.length === 3 &&
      stPrepared.routes.some((r) => r.driverId === 'D1' && r.stopIds.length > 0) &&
      !/ask dispatch/i.test(preparedText),
    `${stPrepared.algorithm} · D1 has ${stPrepared.routes?.find((r) => r.driverId === 'D1')?.stopIds.length} stops`,
  );
  await page.screenshot({ path: path.join(OUT, '10-driver-auto-prepared.png') });

  // ------------------------------------------------------------- API (from node, so the page console stays clean)
  const health = await (await fetch(`${BASE}/api/health`)).json();
  check('api/health ok', health.ok === true && health.algorithm === 'nn-2opt-v1');
  const bad = (await fetch(`${BASE}/api/optimize`, { method: 'POST', body: '{"nope":1}', headers: { 'content-type': 'application/json' } })).status;
  check('api/optimize rejects invalid body with 400', bad === 400, String(bad));
  const seed = await (await fetch(`${BASE}/api/seed`)).json();
  const good = await (await fetch(`${BASE}/api/optimize`, { method: 'POST', body: JSON.stringify(seed), headers: { 'content-type': 'application/json' } })).json();
  check('api/optimize returns 3 routes for the seed', good.routes?.length === 3 && good.algorithm === 'nn-2opt-v1', `${good.computeMs} ms`);
  const inverted = { ...seed, stops: seed.stops.map((s, i) => (i === 0 ? { ...s, timeWindow: { start: '15:00', end: '09:00' } } : s)) };
  const invStatus = (await fetch(`${BASE}/api/optimize`, { method: 'POST', body: JSON.stringify(inverted), headers: { 'content-type': 'application/json' } })).status;
  const tinySpeed = (await fetch(`${BASE}/api/optimize`, { method: 'POST', body: JSON.stringify({ ...seed, options: { avgSpeedKmh: 5e-324 } }), headers: { 'content-type': 'application/json' } })).status;
  check('api/optimize rejects inverted windows and absurd speeds with 400', invStatus === 400 && tinySpeed === 400, `${invStatus} / ${tinySpeed}`);
  const unknownDriver = (await fetch(`${BASE}/driver/NOPE`)).status;
  const unknownRoute = await fetch(`${BASE}/definitely-not-a-page`);
  const unknownRouteText = await unknownRoute.text();
  check('unknown driver id and unknown route are real 404s', unknownDriver === 404 && unknownRoute.status === 404 && /Page not found/.test(unknownRouteText), `${unknownDriver} / ${unknownRoute.status}`);

  // ------------------------------------------------------------- global checks
  // Spec: no runtime network besides OSM tiles, Next assets and our own /api.
  // (The Navigate deep link is a plain <a target=_blank> whose href is asserted
  // above; it is never followed here, so google.com must NOT be needed.)
  const allowed = [new URL(BASE).host, 'tile.openstreetmap.org'];
  const unexpected = [...requestHosts].filter((h) => h && !allowed.includes(h) && !/^[abc]\.tile\.openstreetmap\.org$/.test(h));
  check('network: only own origin + OSM tiles', unexpected.length === 0, `hosts: ${[...requestHosts].filter(Boolean).join(', ')}`);
  const realErrors = consoleErrors.filter((e) => !/favicon/.test(e));
  check('console: no errors', realErrors.length === 0, realErrors.slice(0, 5).join(' | '));
  await page.close();
} catch (err) {
  console.error('SMOKE CRASHED:', err);
  failures++;
} finally {
  await browser.close();
}

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed; screenshots in ${OUT}`);
process.exit(failures ? 1 : 0);
