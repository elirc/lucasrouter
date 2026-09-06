import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const base = process.argv[2] ?? 'http://localhost:3111';
const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(p => p && fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath, headless: true });
fs.mkdirSync('e2e-screens', { recursive: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: 'e2e-screens/rebuilt-home-desktop.png', fullPage: true });
  await page.goto(base + '/dispatch', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.riq-stop-icon');
  assert.equal(await page.$$eval('.riq-stop-icon', nodes => nodes.length), 45);
  assert.equal(await page.$$eval('.leaflet-popup', nodes => nodes.length), 0);
  await page.screenshot({ path: 'e2e-screens/rebuilt-dispatch-desktop.png' });
  await page.type('input[aria-label="Search stops"]', 'S001');
  await page.waitForFunction(() => document.querySelector('[aria-label="Search results"]')?.textContent.includes('1 stop found'));
  await page.click('[aria-label="Search results"] li button');
  await page.waitForSelector('.leaflet-popup');
  assert.match(await page.$eval('.leaflet-popup', el => el.textContent), /Reassign to/);
  assert.equal(await page.$$eval('.leaflet-popup', nodes => nodes.length), 1);
  await page.click('.leaflet-popup-close-button');
  await page.click('button[aria-label="Clear search"]');
  await page.select('select[aria-label="Filter stops by status"]', 'delivered');
  await page.waitForFunction(() => document.querySelector('[aria-label="Search results"]')?.textContent.includes('No matching stops'));
  await page.select('select[aria-label="Filter stops by status"]', 'all');
  const optimizeButton = await page.$('button[data-no-drag]');
  await optimizeButton.click();
  await page.waitForFunction(() => document.querySelector('button[data-no-drag]')?.textContent.includes('Re-optimize'));
  await page.waitForFunction(() => document.querySelectorAll('path.leaflet-interactive').length >= 3);
  await page.screenshot({ path: 'e2e-screens/rebuilt-dispatch-optimized.png' });
  await page.type('input[aria-label="Search stops"]', 'zzzz-no-such-address');
  await page.waitForFunction(() => document.querySelector('[aria-label="Search results"]')?.textContent.includes('No matching stops'));
  await page.click('button[aria-label="Clear search"]');
  await page.goto(base + '/driver', { waitUntil: 'networkidle0' });
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.screenshot({ path: 'e2e-screens/rebuilt-driver-picker.png', fullPage: true });
  await page.goto(base + '/driver/D1', { waitUntil: 'networkidle0' });
  assert.equal(await page.$$eval('dialog', nodes => nodes.length), 0);
  await page.click('button[aria-label^="Mark "][aria-label$="delivered"]');
  await page.waitForSelector('dialog[open]');
  assert.match(await page.$eval('dialog[open]', el => el.textContent), /Confirm delivery/);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('dialog[open]') === null);
  await page.screenshot({ path: 'e2e-screens/rebuilt-driver-route.png', fullPage: true });
  for (const route of ['/', '/driver', '/dispatch']) {
    await page.goto(base + route, { waitUntil: 'networkidle0' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, route + ' must fit a phone');
    await page.screenshot({ path: `e2e-screens/rebuilt-mobile-${route.replaceAll('/', '_')}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: desktop/mobile layout, stop search, filters, empty states, lazy map popup, route optimization, lazy delivery dialog, Escape dismissal, no runtime errors.');
} finally { await browser.close(); }
