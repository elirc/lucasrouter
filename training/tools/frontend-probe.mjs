/**
 * RouteIQ frontend probe: Core Web Vitals, click latency, and two a11y checks.
 * It measures a running PRODUCTION server. The training materials use it to compare
 * `main` with an incident branch.
 *
 *   pnpm build && pnpm start --port 3111
 *   node training/tools/frontend-probe.mjs http://localhost:3111 [label] [--cpu=4] [--runs=3] [--only=vitals,clicks,typing,toast,sheet]
 *
 * Copy it to the repo root first if Node can't resolve puppeteer-core from training/tools/.
 *
 * What it records (JSON goes to e2e-screens/probe-<label>.json, which git ignores):
 *   vitals: for /, /dispatch and /driver/D1 at 390x844 it records FCP, LCP, CLS, decoded JS
 *           bytes, and whether the Leaflet library was downloaded. The JS bytes are everything fetched
 *           by networkidle, INCLUDING Next's idle <Link> prefetch of other routes. For a page's own
 *           critical JS, read the <script src> list in the built .next/server/app/<route>.html instead.
 *   clicks: on desktop /dispatch after Optimize it clicks 12 map markers in turn. From the Event
 *           Timing API it takes the worst click and the p75 click duration, which works as an INP proxy.
 *   typing: on desktop /dispatch it types 25 keystrokes into the stop search (120 ms apart). It records how
 *           many keydowns took >= 16 ms (Event Timing's floor), their p75, and the long-task count and total
 *           during the typing window.
 *   a11y:   (1) Did the Optimize success toast ("Routes ready · ...") render inside an aria-live region that existed
 *           BEFORE the message was inserted? How long did it stay on screen (visibleMs)? (2) On /driver/D1, does keyboard open -> Escape close
 *           the Failed sheet, with focus returned to the Failed button, and was the dialog modal?
 *
 * Calibration: this laptop is slower than Lighthouse's reference device (see DECISIONS #42-44).
 * Compare branches only on the same machine, in the same session, with the same flags. Byte
 * counts are stable across runs. Timings are not, so read them as medians and deltas, never as
 * absolute scores.
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith('http')) ?? 'http://localhost:3111';
const label = args.find((a) => !a.startsWith('http') && !a.startsWith('--')) ?? 'current';
const cpu = Number(args.find((a) => a.startsWith('--cpu='))?.slice(6) ?? 4);
const runs = Number(args.find((a) => a.startsWith('--runs='))?.slice(7) ?? 3);
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',') ?? ['vitals', 'clicks', 'typing', 'toast', 'sheet'];
const executablePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
].find((p) => p && fs.existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const p75 = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.ceil(s.length * 0.75) - 1)] : null;
};

const OBSERVERS = () => {
  window.__probe = { lcp: 0, cls: 0, events: [], longTaskMs: 0, longTasks: 0 };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      window.__probe.longTasks += 1;
      window.__probe.longTaskMs += e.duration;
    }
  }).observe({ type: 'longtask', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__probe.lcp = e.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) window.__probe.cls += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__probe.events.push({ name: e.name, duration: e.duration });
  }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
};

async function throttled(page) {
  const cdp = await page.createCDPSession();
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  return cdp;
}

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
const out = { label, cpu, runs, vitals: [], clicks: null, a11y: {} };
try {
  // Warm the server once per route so cold module loading isn't measured.
  {
    const p = await browser.newPage();
    for (const r of ['/', '/dispatch', '/driver/D1']) await p.goto(base + r, { waitUntil: 'networkidle0' });
    await p.close();
  }

  // ---------------------------------------------------------------- vitals
  for (const route of only.includes('vitals') ? ['/', '/dispatch', '/driver/D1'] : []) {
    const samples = [];
    for (let i = 0; i < runs; i++) {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      await throttled(page);
      await page.evaluateOnNewDocument(OBSERVERS);
      let leaflet = false;
      page.on('response', async (res) => {
        if (!/\.js(\?|$)/.test(res.url())) return;
        try {
          const body = await res.text();
          if (/Leaflet/.test(body) && /latLngToContainerPoint/.test(body)) leaflet = true;
        } catch {
          /* redirected / aborted */
        }
      });
      await page.goto(base + route, { waitUntil: 'networkidle0' });
      if (route === '/dispatch') await page.waitForSelector('.riq-stop-icon', { timeout: 30000 });
      await sleep(500);
      const s = await page.evaluate(() => ({
        fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0),
        lcp: Math.round(window.__probe.lcp),
        cls: Number(window.__probe.cls.toFixed(3)),
        // Decoded bytes of every JS resource, the same measure scripts/performance.mjs uses.
        jsDecoded: performance
          .getEntriesByType('resource')
          .filter((r) => /\.js(\?|$)/.test(r.name))
          .reduce((n, r) => n + r.decodedBodySize, 0),
      }));
      samples.push({ fcp: s.fcp, lcp: s.lcp, cls: s.cls, jsKB: Math.round(s.jsDecoded / 1000), leaflet });
      await ctx.close();
    }
    const row = {
      route,
      fcp: median(samples.map((s) => s.fcp)),
      lcp: median(samples.map((s) => s.lcp)),
      cls: median(samples.map((s) => s.cls)),
      jsKB: median(samples.map((s) => s.jsKB)),
      leafletLoaded: samples.some((s) => s.leaflet),
    };
    out.vitals.push(row);
    console.log('vitals', JSON.stringify(row));
  }

  // ---------------------------------------------------------------- clicks (INP proxy)
  if (only.includes('clicks')) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1366, height: 850 });
    await page.evaluateOnNewDocument(OBSERVERS);
    await page.goto(base + '/dispatch', { waitUntil: 'networkidle0' });
    await page.waitForSelector('.riq-stop-icon', { timeout: 30000 });
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Optimize routes/.test(b.textContent))?.click());
    await page.waitForFunction(() => /Re-optimize/.test(document.body.innerText), { timeout: 30000 });
    await sleep(1500);
    await throttled(page);
    await page.evaluate(() => (window.__probe.events = []));
    const markers = await page.$$('.leaflet-marker-icon.riq-stop-icon');
    let clicked = 0;
    for (const m of markers.slice(0, 40)) {
      if (clicked >= 12) break;
      const box = await m.boundingBox();
      if (!box || box.x < 60 || box.y < 60 || box.x > 700 || box.y > 780) continue; // keep clear of overlays
      await m.click();
      clicked++;
      await sleep(400);
      await page.keyboard.press('Escape');
      await sleep(250);
    }
    const ev = await page.evaluate(() => window.__probe.events.filter((e) => /click|pointerup|pointerdown/.test(e.name)));
    const clickDur = ev.filter((e) => e.name === 'click').map((e) => e.duration);
    out.clicks = { clicked, worstMs: Math.max(0, ...ev.map((e) => e.duration)), p75ClickMs: p75(clickDur), n: clickDur.length };
    console.log('clicks', JSON.stringify(out.clicks));
    await ctx.close();
  }

  // ---------------------------------------------------------------- typing in the stop search (INP proxy)
  if (only.includes('typing')) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1366, height: 850 });
    await page.evaluateOnNewDocument(OBSERVERS);
    await page.goto(base + '/dispatch', { waitUntil: 'networkidle0' });
    await page.waitForSelector('.riq-stop-icon', { timeout: 30000 });
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Optimize routes/.test(b.textContent))?.click());
    await page.waitForFunction(() => /Re-optimize/.test(document.body.innerText), { timeout: 30000 });
    await sleep(1500);
    await page.focus('input[aria-label="Search stops"]');
    await page.keyboard.type('u'); // the first keystroke swaps the route list for results; not what we measure
    await sleep(1000);
    await throttled(page);
    await page.evaluate(() => {
      window.__probe.events = [];
      window.__probe.longTaskMs = 0;
      window.__probe.longTasks = 0;
    });
    await page.keyboard.type('niversity ave', { delay: 120 });
    await sleep(800);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Backspace');
      await sleep(120);
    }
    await sleep(800);
    const ev = await page.evaluate(() => window.__probe.events.filter((e) => /key|input|beforeinput/.test(e.name)));
    const keyDur = ev.filter((e) => e.name === 'keydown').map((e) => e.duration);
    const lt = await page.evaluate(() => ({ longTasks: window.__probe.longTasks, longTaskMs: Math.round(window.__probe.longTaskMs) }));
    out.typing = { slowKeys: keyDur.length, p75SlowKeyMs: p75(keyDur), worstMs: Math.max(0, ...ev.map((e) => e.duration)), ...lt };
    console.log('typing', JSON.stringify(out.typing));
    await ctx.close();
  }

  // ---------------------------------------------------------------- a11y: toast live region
  if (only.includes('toast')) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1366, height: 850 });
    await page.goto(base + '/dispatch', { waitUntil: 'networkidle0' });
    await page.waitForSelector('.riq-stop-icon', { timeout: 30000 });
    // Mark every live region that exists before the action, then watch for the toast text.
    // Checking at insertion time is deliberate: on main the dispatch toast only stays up
    // for about 200 ms (see the ladder), so a later DOM query can miss it.
    await page.evaluate(() => {
      document.querySelectorAll('[aria-live],[role=status],[role=alert]').forEach((el) => el.setAttribute('data-probe-pre', '1'));
      window.__toastSeen = null;
      new MutationObserver(() => {
        if (window.__toastSeen) return;
        const el = [...document.querySelectorAll('span')].find((n) => /^Routes ready ·/.test(n.textContent ?? ''));
        if (!el) return;
        const region = el.closest('[aria-live],[role=status],[role=alert]');
        window.__toastSeen = { found: true, inLiveRegion: !!region, regionExistedBefore: region?.getAttribute('data-probe-pre') === '1', at: performance.now() };
        const gone = () => (window.__toastSeen.visibleMs = Math.round(performance.now() - window.__toastSeen.at));
        new MutationObserver((_, obs) => { if (!el.isConnected) { gone(); obs.disconnect(); } }).observe(document.body, { childList: true, subtree: true });
      }).observe(document.body, { childList: true, subtree: true });
    });
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Optimize routes/.test(b.textContent))?.click());
    await page.waitForFunction(() => window.__toastSeen, { timeout: 30000 });
    await sleep(4500);
    out.a11y.toast = await page.evaluate(() => {
      const seen = { ...window.__toastSeen };
      delete seen.at;
      return seen;
    });
    console.log('toast', JSON.stringify(out.a11y.toast));
    await ctx.close();
  }

  // ---------------------------------------------------------------- a11y: driver sheet keyboard
  if (only.includes('sheet')) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(base + '/driver/D1', { waitUntil: 'networkidle0' });
    await page.waitForSelector('button[aria-label^="Mark "][aria-label$=" failed"]', { timeout: 30000 });
    await sleep(1200); // NextStopCard ignores presses right after it appears
    await page.focus('button[aria-label^="Mark "][aria-label$=" failed"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog[open]', { timeout: 5000 });
    await sleep(400);
    const modal = await page.evaluate(() => document.querySelector('dialog[open]')?.matches(':modal') ?? null);
    await page.keyboard.press('Escape');
    await sleep(600);
    out.a11y.sheet = await page.evaluate(() => ({
      closedByEscape: !document.querySelector('dialog[open]'),
      focusReturned: /failed$/.test(document.activeElement?.getAttribute('aria-label') ?? ''),
    }));
    out.a11y.sheet.modal = modal;
    console.log('sheet', JSON.stringify(out.a11y.sheet));
    await ctx.close();
  }
} finally {
  await browser.close();
}
fs.mkdirSync('e2e-screens', { recursive: true });
fs.writeFileSync(`e2e-screens/probe-${label}.json`, JSON.stringify(out, null, 2));
