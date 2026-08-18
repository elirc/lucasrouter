// Proof-of-delivery photos. The whole app state lives in localStorage (~5 MB
// for the origin), so a camera frame — 2–5 MB of JPEG, ~7 MB once base64'd —
// can never be stored as-is. Everything captured here is downscaled to a
// thumbnail first: longest side <= 320 px, JPEG quality 0.7, ~15–40 KB.
//
// The size math is pure and unit-tested; only `makeThumbnail` touches the DOM.

/** Longest side of a stored proof photo, in CSS pixels. */
export const MAX_THUMB_PX = 320;

/** JPEG quality for the thumbnail (0.7 keeps a parcel/door recognisable). */
export const THUMB_QUALITY = 0.7;

/**
 * Refuse to store anything above this even after downscaling — a pathological
 * image (huge, noisy) can still come out big, and one photo must never eat the
 * whole storage budget. ~60 KB of data URL.
 */
export const MAX_THUMB_BYTES = 60_000;

/**
 * Scale `width`x`height` down so its longest side is at most `max`, preserving
 * the aspect ratio. Never upscales; always returns integers >= 1.
 */
export function fitWithin(width: number, height: number, max = MAX_THUMB_PX): { width: number; height: number } {
  const w = Math.max(1, Math.round(width || 0));
  const h = Math.max(1, Math.round(height || 0));
  const longest = Math.max(w, h);
  if (longest <= max) return { width: w, height: h };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * What a stored photo costs the app: the length of the data URL itself, which
 * is exactly what the persisted JSON blob carries. THIS is the measure the
 * store budgets with (`PHOTO_BUDGET_BYTES`, `photoBytesInUse`) and therefore
 * the one the delivery sheet shows — the decoded size below is ~1.34x smaller,
 * and showing that one made "Photo attached · 28 KB" and "the photo budget is
 * full" look like they were talking about different pictures.
 */
export function storedPhotoBytes(dataUrl: string | undefined): number {
  return dataUrl?.length ?? 0;
}

/**
 * Decoded byte size of a data URL — what the image costs on the wire or on
 * disk once written out as a file, NOT what it costs in localStorage (which
 * stores the data-URL string itself: use `storedPhotoBytes` for the budget).
 * Returns 0 for anything that is not a base64 data URL.
 */
export function dataUrlBytes(dataUrl: string | undefined): number {
  if (!dataUrl) return 0;
  const idx = dataUrl.indexOf(',');
  if (idx === -1 || !dataUrl.slice(0, idx).includes('base64')) return 0;
  const b64 = dataUrl.slice(idx + 1);
  if (b64.length === 0) return 0;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

/** Decode a picked file into something `drawImage` accepts (or null). */
async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      // `from-image` honours the EXIF orientation phones write instead of
      // rotating pixels, so a portrait shot is not stored sideways.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Fall through to the <img> path (older Safari, unsupported option).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } finally {
    // Safe to revoke immediately after decode: the bitmap is already in memory.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Downscale a camera/gallery file to a JPEG data URL, or null when the file is
 * not an image, cannot be decoded, or is still too big afterwards. Never
 * throws — a failed photo must not lose the delivery record.
 */
export async function makeThumbnail(file: File, maxPx = MAX_THUMB_PX): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null;
  try {
    const source = await loadImage(file);
    if (!source) return null;
    const { width, height } = fitWithin(source.width, source.height, maxPx);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, width, height);
    if ('close' in source) source.close();
    const dataUrl = canvas.toDataURL('image/jpeg', THUMB_QUALITY);
    if (!dataUrl.startsWith('data:image/jpeg')) return null; // canvas tainted / unsupported
    return dataUrl.length > MAX_THUMB_BYTES ? null : dataUrl;
  } catch {
    return null;
  }
}
