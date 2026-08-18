/**
 * Generates public/map-placeholder.svg — a stylised, abstract silhouette of
 * Madison's isthmus (two lakes, a diagonal arterial, a street grid) used as the
 * loading placeholder behind the real Leaflet map. Zero dependencies.
 *
 *   node scripts/generate-map-placeholder.mjs
 *
 * Why an image and not a plain grey block: it reads as "a map is coming",
 * it ships in the server-rendered HTML (so it paints at first contentful
 * paint), and — being the largest element on a phone — it is the page's LCP
 * candidate instead of a map tile that can only appear after Leaflet boots.
 * The drawing is generic (no OSM data), tiny (a few KB), and slate-toned so
 * the real tiles feel like the placeholder "coming into focus".
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const W = 750;
const H = 1200;
const parts = [];

// Deterministic pseudo-random for jitter (no Math.random → reproducible file).
let seed = 20260817;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

parts.push(`<rect width="${W}" height="${H}" fill="#e2e8f0"/>`);

// Soft green "parks" (blobs).
const parks = [
  [120, 980, 90, 60],
  [600, 300, 70, 50],
  [660, 1050, 80, 60],
  [90, 300, 60, 45],
  [420, 1120, 110, 50],
];
for (const [cx, cy, rx, ry] of parks) {
  parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#dbe7d9"/>`);
}

// Street grid: light lines with a little jitter, rotated blocks near the isthmus.
const grid = [];
for (let x = 40; x < W; x += 58) {
  const j = Math.round((rnd() - 0.5) * 10);
  grid.push(`M${x + j} 0 L${x - j} ${H}`);
}
for (let y = 40; y < H; y += 58) {
  const j = Math.round((rnd() - 0.5) * 10);
  grid.push(`M0 ${y + j} L${W} ${y - j}`);
}
parts.push(`<path d="${grid.join(' ')}" stroke="#f1f5f9" stroke-width="3" fill="none"/>`);

// Lakes: Mendota (large, upper-left) and Monona (lower-right), Wingra (small).
parts.push(
  `<path d="M-40 380 C 40 250, 260 200, 400 260 C 520 310, 540 420, 470 520 C 400 620, 250 640, 120 600 C 10 565, -60 480, -40 380 Z" fill="#cbd5e1"/>`,
);
parts.push(
  `<path d="M470 700 C 560 640, 720 660, 790 760 C 830 830, 760 930, 650 940 C 540 950, 440 880, 440 800 C 440 760, 450 715, 470 700 Z" fill="#cbd5e1"/>`,
);
parts.push(`<ellipse cx="200" cy="860" rx="70" ry="42" fill="#cbd5e1"/>`);

// Water texture: a few thin ripples.
const ripples = [];
for (let i = 0; i < 9; i++) {
  const x = 60 + i * 42;
  const y = 350 + (i % 3) * 60;
  ripples.push(`M${x} ${y} q 12 -6 24 0 t 24 0`);
}
parts.push(`<path d="${ripples.join(' ')}" stroke="#e2e8f0" stroke-width="2" fill="none" opacity="0.9"/>`);

// Arterials: the diagonal isthmus roads + a beltline.
const arterials = [
  'M400 620 L 720 300',           // NE diagonal (E Washington-ish)
  'M420 640 L 700 340',
  'M120 720 C 260 690, 380 660, 440 640', // Monroe/Regent-ish
  'M0 1000 C 200 980, 520 990, 750 960',   // Beltline
  'M540 0 C 520 200, 560 260, 620 320',
  'M660 0 L 750 120',
  'M0 700 L 120 720',
  'M300 1200 L 340 980 C 360 900, 400 820, 440 800',
];
parts.push(`<path d="${arterials.join(' ')}" stroke="#f8fafc" stroke-width="10" stroke-linecap="round" fill="none"/>`);
parts.push(`<path d="${arterials.join(' ')}" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.5"/>`);

// Capitol square hint at the isthmus centre.
parts.push(`<rect x="440" y="600" width="26" height="26" rx="6" fill="#f8fafc" transform="rotate(45 453 613)"/>`);

// Small "buildings" texture near downtown/east side.
const bl = [];
for (let i = 0; i < 420; i++) {
  // Downtown/east side cluster plus a sparser scatter across the west side.
  const west = i > 300;
  const x = west ? 20 + Math.round(rnd() * 360) : 380 + Math.round(rnd() * 340);
  const y = west ? 660 + Math.round(rnd() * 500) : 380 + Math.round(rnd() * 300);
  const s = 3 + Math.round(rnd() * 6);
  bl.push(`M${x} ${y} h${s} v${s} h-${s} z`);
}
parts.push(`<path d="${bl.join(' ')}" fill="#cbd5e1" opacity="0.7"/>`);

// Intrinsic size is declared at half the drawing units (375x600 CSS px) so the
// file's bytes-per-pixel stays well above Chrome's low-entropy LCP cutoff.
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W / 2}" height="${H / 2}" role="img" aria-label="">` +
  parts.join('') +
  `</svg>\n`;

const out = resolve(process.cwd(), 'public/map-placeholder.svg');
writeFileSync(out, svg);
console.log(`wrote ${out} (${svg.length} bytes)`);

// Rasterise to WebP as well. The <img> in the app uses the WebP: an SVG in an
// <img> is painted on the main thread, which is saturated by JS during boot on
// slow devices, so its first paint slips by seconds; a raster decodes off the
// main thread and paints in the compositor as soon as it arrives. Optional —
// needs puppeteer-core (dev dependency) and a local Chrome/Edge.
try {
  const { default: puppeteer } = await import('puppeteer-core');
  const { existsSync } = await import('node:fs');
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const executablePath = candidates.find((p) => existsSync(p));
  if (!executablePath) throw new Error('no local Chrome/Edge (set CHROME_PATH)');
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: W / 2, height: H / 2, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${W / 2}" height="${H / 2}" style="display:block"></body></html>`);
  const webpPath = resolve(process.cwd(), 'public/map-placeholder.webp');
  await page.screenshot({ path: webpPath, type: 'webp', quality: 72, clip: { x: 0, y: 0, width: W / 2, height: H / 2 } });
  await browser.close();
  const { statSync } = await import('node:fs');
  console.log(`wrote ${webpPath} (${statSync(webpPath).size} bytes)`);
} catch (err) {
  console.warn(`skipped WebP rasterisation: ${err.message}`);
}
