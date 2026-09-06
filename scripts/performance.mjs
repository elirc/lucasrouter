import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const base = process.argv[2] ?? 'http://localhost:3111';
const label = process.argv[3] ?? 'current';
const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(p => p && fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath, headless: true });
const results = [];
fs.mkdirSync('e2e-screens', { recursive: true });
try {
  for (const route of ['/', '/driver', '/dispatch', '/driver/D1']) {
    for (let run = 0; run < 3; run++) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      await page.evaluateOnNewDocument(() => {
        window.perfSample = { blockingMs: 0 };
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) window.perfSample.blockingMs += Math.max(0, entry.duration - 50);
        }).observe({ type: 'longtask', buffered: true });
      });
      await page.goto(base + route, { waitUntil: 'networkidle0' });
      if (route === '/dispatch') await page.waitForSelector('.riq-stop-icon');
      if (route === '/driver/D1') await page.waitForSelector('a[href*="google.com/maps"]');
      const sample = await page.evaluate(() => ({
        fcpMs: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0),
        blockingMs: Math.round(window.perfSample.blockingMs),
        jsBytes: performance.getEntriesByType('resource').filter(r => /\.js(?:\?|$)/.test(r.name)).reduce((n, r) => n + r.decodedBodySize, 0),
        htmlBytes: performance.getEntriesByType('navigation')[0].decodedBodySize,
      }));
      results.push({ route, run, ...sample });
      if (run === 0) await page.screenshot({ path: `e2e-screens/${label}-${route.replaceAll('/', '_') || 'home'}.png`, fullPage: true });
      console.log(JSON.stringify(results.at(-1)));
      await context.close();
    }
  }
} finally { await browser.close(); }
fs.writeFileSync(`e2e-screens/performance-${label}.json`, JSON.stringify(results, null, 2));
