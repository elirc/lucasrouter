/* RouteIQ minimal service worker.
 *
 * Deliberately tiny: it exists so the app is installable (PWA) and shows a
 * friendly page when a navigation happens offline. It never caches OSM tiles,
 * Next assets or /api responses — everything except same-origin navigations is
 * passed straight through to the network untouched.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Navigation preload: the browser issues the navigation request in
      // parallel with booting this worker instead of after it. Without it every
      // navigation on a repeat visit waits for service-worker startup (tens to
      // hundreds of ms on a phone) before the HTML is even requested — a cost
      // this worker would otherwise add for no benefit, since it does not cache.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => {});
      }
      await self.clients.claim();
    })(),
  );
});

const OFFLINE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RouteIQ — Offline</title>
<style>
  body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;
       font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f1f5f9;color:#0f172a;text-align:center;padding:24px}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px 28px;max-width:360px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
  h1{font-size:20px;margin:0 0 8px}p{margin:0 0 20px;color:#475569;font-size:14px;line-height:1.5}
  button{min-height:44px;padding:0 20px;border:0;border-radius:12px;background:#0f172a;color:#fff;font-size:14px;font-weight:600;cursor:pointer}
</style></head>
<body><div class="card"><h1>You&#8217;re offline</h1>
<p>RouteIQ needs a connection to load. Check your network and try again.</p>
<button onclick="location.reload()">Retry</button></div></body></html>`;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return; // pass through untouched

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        // Whatever the browser already started fetching while this worker woke up.
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(req);
      } catch {
        return new Response(OFFLINE_HTML, {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      }
    })(),
  );
});
