import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const client = await page.createCDPSession();
await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await client.send('Profiler.enable');
await client.send('Profiler.setSamplingInterval', { interval: 500 });
await client.send('Profiler.start');
await page.goto('http://localhost:3000/dispatch', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1500));
const { profile } = await client.send('Profiler.stop');
// aggregate self time per function
const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas;
for (let i = 0; i < profile.samples.length; i++) {
  const n = nodes.get(profile.samples[i]);
  const key = `${n.callFrame.functionName || '(anon)'} @ ${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber}:${n.callFrame.columnNumber}`;
  self.set(key, (self.get(key) || 0) + (dt[i] || 0));
}
const total = [...self.values()].reduce((a, b) => a + b, 0) / 1000;
console.log('total sampled ms', total.toFixed(0));
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
for (const [k, v] of top) console.log((v / 1000).toFixed(1).padStart(7), k);
// aggregate by url
const byUrl = new Map();
for (let i = 0; i < profile.samples.length; i++) {
  const n = nodes.get(profile.samples[i]);
  const u = (n.callFrame.url || n.callFrame.functionName || '(native)').split('/').pop();
  byUrl.set(u, (byUrl.get(u) || 0) + (dt[i] || 0));
}
console.log('--- by url');
for (const [k, v] of [...byUrl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log((v / 1000).toFixed(1).padStart(7), k);
await browser.close();
