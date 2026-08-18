#!/usr/bin/env node
/**
 * Generates the RouteIQ PWA icons with ZERO dependencies (pure Node):
 *   public/icons/icon-192.png        (192×192)
 *   public/icons/icon-512.png        (512×512)
 *   public/icons/apple-touch-icon.png (180×180)
 *
 * The artwork mirrors public/icons/icon.svg: a slate-900 (#0f172a) rounded
 * square with a white route curve threading three white waypoint dots.
 * Every shape is rasterised from a signed-distance function so edges are
 * anti-aliased without supersampling; the RGBA buffer is then encoded as a
 * PNG by hand (zlib.deflateSync + manual CRC32 chunks).
 *
 * Usage: node scripts/generate-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'public', 'icons');

// ---------------------------------------------------------------------------
// Artwork (defined in a 512×512 design space, scaled per output size)
// ---------------------------------------------------------------------------

const DESIGN = 512;
const BG = [0x0f, 0x17, 0x2a]; // slate-900
const FG = [0xff, 0xff, 0xff];
const CORNER_RADIUS = 112; // matches rx in icon.svg
const STROKE_WIDTH = 36;
const DOT_RADIUS = 40;

// Route: M112 368 Q192 144, 264 264 T 400 144  (two quadratic Béziers)
const P0 = [112, 368];
const C1 = [192, 144];
const P1 = [264, 264];
const C2 = [2 * P1[0] - C1[0], 2 * P1[1] - C1[1]]; // reflected control point (T)
const P2 = [400, 144];
const DOTS = [P0, P1, P2];

/** Flatten a quadratic Bézier into `n` segments' worth of points. */
function quadPoints(a, c, b, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    pts.push([
      mt * mt * a[0] + 2 * mt * t * c[0] + t * t * b[0],
      mt * mt * a[1] + 2 * mt * t * c[1] + t * t * b[1],
    ]);
  }
  return pts;
}

/** Polyline approximation of the whole route (design units). */
const ROUTE = [...quadPoints(P0, C1, P1, 64), ...quadPoints(P1, C2, P2, 64).slice(1)];

/** Distance from point to a segment. */
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 === 0 ? 0 : (wx * vx + wy * vy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Distance from point to the route polyline. */
function routeDist(px, py) {
  let best = Infinity;
  for (let i = 1; i < ROUTE.length; i++) {
    const d = segDist(px, py, ROUTE[i - 1][0], ROUTE[i - 1][1], ROUTE[i][0], ROUTE[i][1]);
    if (d < best) best = d;
  }
  return best;
}

/** Signed distance to a rounded box centred at (cx,cy) with half-size h and radius r. */
function roundedBoxSdf(px, py, cx, cy, h, r) {
  const qx = Math.abs(px - cx) - (h - r);
  const qy = Math.abs(py - cy) - (h - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Coverage in [0,1] from a signed distance (negative = inside), 1px AA ramp. */
function coverage(sd) {
  const c = 0.5 - sd;
  return c < 0 ? 0 : c > 1 ? 1 : c;
}

/** Rasterise the icon at `size` px into an RGBA buffer. */
function renderIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const s = size / DESIGN; // design → pixel scale
  const inv = 1 / s;
  const half = DESIGN / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Sample at pixel centre, in design units.
      const dx = (x + 0.5) * inv;
      const dy = (y + 0.5) * inv;

      // Background: rounded square (distance is in design units → scale to px).
      const bgCov = coverage(roundedBoxSdf(dx, dy, half, half, half, CORNER_RADIUS) * s);

      // Foreground: stroke ∪ dots.
      let fgSd = routeDist(dx, dy) - STROKE_WIDTH / 2;
      for (const [cx, cy] of DOTS) {
        const d = Math.hypot(dx - cx, dy - cy) - DOT_RADIUS;
        if (d < fgSd) fgSd = d;
      }
      const fgCov = coverage(fgSd * s) * bgCov; // clip foreground to background

      const i = (y * size + x) * 4;
      // Composite: transparent → BG → FG.
      const r = BG[0] * (1 - fgCov) + FG[0] * fgCov;
      const g = BG[1] * (1 - fgCov) + FG[1] * fgCov;
      const b = BG[2] * (1 - fgCov) + FG[2] * fgCov;
      buf[i] = Math.round(r);
      buf[i + 1] = Math.round(g);
      buf[i + 2] = Math.round(b);
      buf[i + 3] = Math.round(bgCov * 255);
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// PNG encoding
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([len, typeBytes, data, crc]);
}

/** Encode an RGBA buffer as a PNG (8-bit, colour type 6, no interlace). */
function encodePng(rgba, width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Each scanline is prefixed with filter type 0 (None).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const TARGETS = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

mkdirSync(OUT_DIR, { recursive: true });

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let ok = true;
for (const { file, size } of TARGETS) {
  const started = Date.now();
  const png = encodePng(renderIcon(size), size, size);
  const out = join(OUT_DIR, file);
  writeFileSync(out, png);

  // Self-check: signature + non-trivial size.
  const head = readFileSync(out).subarray(0, 8);
  const bytes = statSync(out).size;
  const valid = head.equals(PNG_SIG) && bytes > 1000;
  ok &&= valid;
  console.log(
    `${valid ? 'ok ' : 'BAD'} ${file.padEnd(22)} ${String(size).padStart(3)}px  ${String(bytes).padStart(6)} bytes  ${Date.now() - started}ms`,
  );
}

if (!ok) {
  console.error('Icon generation failed self-check.');
  process.exit(1);
}
