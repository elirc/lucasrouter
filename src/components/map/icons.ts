// Memoised `L.divIcon` factories. Leaflet icons are plain objects that hold an
// HTML string; creating them per render is wasteful and forces Leaflet to
// re-create marker DOM nodes. Every factory here caches by a string key so a
// given visual state always maps to the same icon instance.

import { divIcon, type DivIcon } from 'leaflet';
import { onColor } from '@/lib/color';
import type { Priority, StopStatus } from '@/lib/types';
import {
  DELIVERED_COLOR,
  DEPOT_COLOR,
  FAILED_COLOR,
  HERE_COLOR,
  OVERNIGHT_COLOR,
  PRIORITY_COLOR,
  UNASSIGNED_COLOR,
} from './colors';

export { UNASSIGNED_COLOR } from './colors';

/** Escape text for safe interpolation into icon HTML. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Restrict a colour string to a safe CSS colour token (hex / rgb / named). */
function safeColor(color: string, fallback: string): string {
  return /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|rgba?\([0-9.,\s%]+\))$/.test(color) ? color : fallback;
}

/** `#rrggbb` + alpha suffix (hex 00–ff). Falls back to plain colour for non-hex input. */
function withAlpha(color: string, alphaHex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}${alphaHex}` : color;
}

// ---------------------------------------------------------------------------
// Stop marker
// ---------------------------------------------------------------------------

export interface StopIconSpec {
  /** Fill colour: driver colour, or `UNASSIGNED_COLOR`. */
  color: string;
  /** 1-based sequence number when routed and numbering is on; null otherwise. */
  seq: number | null;
  priority: Priority;
  status: StopStatus;
  selected: boolean;
}

const STOP_SIZE = 28;
const stopIconCache = new Map<string, DivIcon>();

const CHECK_SVG =
  '<svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="' +
  DELIVERED_COLOR +
  '" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const X_SVG =
  '<svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

/**
 * Circular 28px pin filled with the driver colour, white 2px border and drop
 * shadow. Shows the sequence number (in a contrast-safe colour) when routed, a priority/overnight dot
 * top-right, a delivered check / failed X badge bottom-right, and a soft ring
 * when selected. Cached by visual state.
 */
export function stopIcon(spec: StopIconSpec): DivIcon {
  const color = safeColor(spec.color, UNASSIGNED_COLOR);
  const key = `${color}|${spec.seq ?? ''}|${spec.priority}|${spec.status}|${spec.selected ? 1 : 0}`;
  const cached = stopIconCache.get(key);
  if (cached) return cached;

  const ring = spec.selected ? `0 0 0 4px ${withAlpha(color, '66')}, ` : '';
  const shadow = `${ring}0 1px 3px rgba(15,23,42,.45)`;
  const opacity = spec.status === 'delivered' ? 0.75 : 1;

  // Sequence number: white only where it reads at AA on the driver colour;
  // slate-900 otherwise (white on the orange/green seed colours is < 3.5:1).
  const number =
    spec.seq !== null
      ? `<span style="color:${onColor(color)};font-size:11px;font-weight:600;line-height:1;letter-spacing:-.02em">${spec.seq}</span>`
      : '';

  let topBadge = '';
  if (spec.priority === 'priority' || spec.priority === 'overnight') {
    const badgeColor = spec.priority === 'priority' ? PRIORITY_COLOR : OVERNIGHT_COLOR;
    topBadge = `<span style="position:absolute;top:-1px;right:-1px;width:9px;height:9px;border-radius:9999px;background:${badgeColor};border:1.5px solid #fff;box-sizing:content-box"></span>`;
  }

  let bottomBadge = '';
  if (spec.status === 'delivered') {
    bottomBadge = `<span style="position:absolute;bottom:-2px;right:-2px;width:12px;height:12px;border-radius:9999px;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px rgba(15,23,42,.15)">${CHECK_SVG}</span>`;
  } else if (spec.status === 'failed') {
    bottomBadge = `<span style="position:absolute;bottom:-2px;right:-2px;width:12px;height:12px;border-radius:9999px;background:${FAILED_COLOR};display:flex;align-items:center;justify-content:center;border:1.5px solid #fff;box-sizing:border-box">${X_SVG}</span>`;
  }

  const html =
    `<div style="position:relative;width:${STOP_SIZE}px;height:${STOP_SIZE}px;opacity:${opacity}">` +
    `<div style="width:100%;height:100%;border-radius:9999px;background:${color};border:2px solid #fff;box-sizing:border-box;box-shadow:${shadow};display:flex;align-items:center;justify-content:center">${number}</div>` +
    topBadge +
    bottomBadge +
    `</div>`;

  const icon = divIcon({
    html,
    className: 'riq-stop-icon',
    iconSize: [STOP_SIZE, STOP_SIZE],
    iconAnchor: [STOP_SIZE / 2, STOP_SIZE / 2],
    popupAnchor: [0, -(STOP_SIZE / 2 + 4)],
    tooltipAnchor: [0, -(STOP_SIZE / 2)],
  });
  stopIconCache.set(key, icon);
  return icon;
}

// ---------------------------------------------------------------------------
// Depot marker
// ---------------------------------------------------------------------------

const DEPOT_SIZE = 32;
let depotIconInstance: DivIcon | null = null;

/** Slate-900 rounded square with a white warehouse glyph. */
export function depotIcon(): DivIcon {
  if (depotIconInstance) return depotIconInstance;
  const glyph =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/>' +
    '<path d="M6 18h12"/><path d="M6 14h12"/><rect width="12" height="12" x="6" y="10"/></svg>';
  const html =
    `<div style="width:${DEPOT_SIZE}px;height:${DEPOT_SIZE}px;border-radius:8px;background:${DEPOT_COLOR};border:2px solid #fff;box-sizing:border-box;box-shadow:0 2px 6px rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center">${glyph}</div>`;
  depotIconInstance = divIcon({
    html,
    className: 'riq-depot-icon',
    iconSize: [DEPOT_SIZE, DEPOT_SIZE],
    iconAnchor: [DEPOT_SIZE / 2, DEPOT_SIZE / 2],
    popupAnchor: [0, -(DEPOT_SIZE / 2 + 4)],
    tooltipAnchor: [0, -(DEPOT_SIZE / 2)],
  });
  return depotIconInstance;
}

// ---------------------------------------------------------------------------
// Direction arrow (route midpoints)
// ---------------------------------------------------------------------------

const ARROW_SIZE = 16;
/** Bearings are quantised to 5° so the cache holds at most 72 icons per colour. */
const ARROW_STEP = 5;
const arrowIconCache = new Map<string, DivIcon>();

/** Small triangle rotated to `bearing` (degrees clockwise from north). */
export function arrowIcon(bearing: number, color: string): DivIcon {
  const q = ((Math.round(bearing / ARROW_STEP) * ARROW_STEP) % 360 + 360) % 360;
  const c = safeColor(color, DEPOT_COLOR);
  const key = `${c}|${q}`;
  const cached = arrowIconCache.get(key);
  if (cached) return cached;
  const html =
    `<svg viewBox="0 0 16 16" width="${ARROW_SIZE}" height="${ARROW_SIZE}" style="display:block;transform:rotate(${q}deg)" aria-hidden="true">` +
    `<path d="M8 1.5 14 13.5 8 10.5 2 13.5Z" fill="${c}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  const icon = divIcon({
    html,
    className: 'riq-arrow-icon',
    iconSize: [ARROW_SIZE, ARROW_SIZE],
    iconAnchor: [ARROW_SIZE / 2, ARROW_SIZE / 2],
  });
  arrowIconCache.set(key, icon);
  return icon;
}

// ---------------------------------------------------------------------------
// Leg-start dot (driver focus mode: previous stop or depot)
// ---------------------------------------------------------------------------

const HERE_SIZE = 40;
let hereIconInstance: DivIcon | null = null;

/** Blue 14px dot with a pulsing 40%-opacity halo (keyframes live in map.css). */
export function hereIcon(): DivIcon {
  if (hereIconInstance) return hereIconInstance;
  const html =
    `<div style="position:relative;width:${HERE_SIZE}px;height:${HERE_SIZE}px">` +
    `<span class="riq-here-halo" style="position:absolute;inset:0;border-radius:9999px;background:${HERE_COLOR};opacity:.4"></span>` +
    `<span style="position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:9999px;background:${HERE_COLOR};border:2px solid #fff;box-sizing:border-box;box-shadow:0 1px 3px rgba(15,23,42,.45)"></span>` +
    `</div>`;
  hereIconInstance = divIcon({
    html,
    className: 'riq-here-icon',
    iconSize: [HERE_SIZE, HERE_SIZE],
    iconAnchor: [HERE_SIZE / 2, HERE_SIZE / 2],
  });
  return hereIconInstance;
}
