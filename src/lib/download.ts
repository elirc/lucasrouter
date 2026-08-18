// Browser download helpers shared by the dispatcher's JSON export and the
// driver's end-of-day report. Kept dependency-free (a temporary <a download>
// + object URL is the only key-less way to hand a file to the browser).

/**
 * Trigger a browser download of `text` as `filename` via a temporary
 * <a download>.
 *
 * CSV gets a UTF-8 BOM: Excel on Windows (the depot's spreadsheet) opens a
 * BOM-less UTF-8 file as ANSI/CP-1252, which turns every non-ASCII character
 * in an address, a recipient name or a driver's note into mojibake
 * ("Muñoz" -> "MuÃ±oz"). The BOM is invisible in Excel, Sheets, Numbers and
 * LibreOffice alike. JSON gets none: `JSON.parse` rejects a leading BOM.
 */
export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const body = type.startsWith('text/csv') ? `\uFEFF${text}` : text;
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Local YYYY-MM-DD, for export filenames (no Intl — see DECISIONS #42). */
export function todayStamp(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
