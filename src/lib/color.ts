// Tiny colour helpers (no dependencies). Used to pick a readable foreground
// for text placed on a driver's route colour (markers, chips, sequence circles).

/** Parse "#rgb" / "#rrggbb" into [r, g, b] (0–255). Returns null when malformed. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (≥ 4.5 passes AA for body text). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const DARK = '#0f172a'; // slate-900
const LIGHT = '#ffffff';

/**
 * Foreground colour that reads on `background`: white when it has ≥ 4.5:1
 * contrast, otherwise slate-900. For the seed drivers: blue #2563eb → white,
 * orange #f97316 → slate-900, green #16a34a → slate-900.
 */
export function onColor(background: string): string {
  return contrastRatio(LIGHT, background) >= 4.5 ? LIGHT : DARK;
}
