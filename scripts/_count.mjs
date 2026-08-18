import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const client = await page.createCDPSession();
await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.evaluateOnNewDocument(() => {
  window.__counts = { tlds: 0, tldsMs: 0, offsetHeight: 0, ro: 0 };
  const orig = Date.prototype.toLocaleDateString;
  Date.prototype.toLocaleDateString = function (...a) {
    const t = performance.now();
    const r = orig.apply(this, a);
    window.__counts.tlds++;
    window.__counts.tldsMs += performance.now() - t;
    return r;
  };
  const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    get() {
      window.__counts.offsetHeight++;
      return d.get.call(this);
    },
  });
  const RO = window.ResizeObserver;
  window.ResizeObserver = class extends RO {
    constructor(cb) {
      super((...args) => {
        window.__counts.ro++;
        cb(...args);
      });
    }
  };
});
await page.goto('http://localhost:3000/dispatch', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1500));
console.log(await page.evaluate(() => window.__counts));
await browser.close();
