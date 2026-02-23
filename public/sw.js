/**
 * sw.js  —  Service Worker for Football GM
 *
 * Caching strategy (ZenGM-style reliability):
 *
 *  HTML navigation  → Network-first, fall back to cache.
 *    index.html must ALWAYS be fetched fresh so new Netlify deploys are
 *    immediately visible.  On iOS PWA ("Add to Home Screen"), the browser
 *    honours the SW's response, not its own HTTP cache — so if the SW returns
 *    stale HTML, the user never sees updates.
 *
 *  /assets/** (hashed filenames) → Cache-first.
 *    Vite includes a content hash in every JS/CSS filename.  Once cached, the
 *    file never changes, so cache-forever is safe and optimal.
 *
 *  Everything else → Cache-first with network fallback.
 *
 * Update flow:
 *  1. Browser fetches /sw.js on every page load (Netlify sends no-cache headers).
 *  2. If the file changed, a new SW installs and immediately skips waiting.
 *  3. On activate, the new SW claims all clients and posts APP_UPDATED so the
 *     React app can show an "Update available" banner.
 *
 * Bump CACHE_NAME on breaking changes to force a full cache wipe.
 */

const CACHE_NAME = 'football-gm-v2';

/** Minimal shell to precache on install (HTML fetched fresh every time). */
const PRECACHE_URLS = ['/manifest.json'];

// ── Install ───────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Best-effort precache — don't block install if manifest is unavailable
      await cache.addAll(PRECACHE_URLS).catch(err =>
        console.warn('[SW] Precache failed (non-fatal):', err)
      );
      // Activate immediately — don't wait for old pages to close
      self.skipWaiting();
    })
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Evict all old caches
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );

      // Take control of every open tab immediately
      await self.clients.claim();

      // Tell all window clients a new SW is active so they can prompt the user.
      // We broadcast to every client; the React app checks whether an old SW
      // was previously in control before deciding to show the update banner.
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(client =>
        client.postMessage({ type: 'APP_UPDATED' })
      );
    })()
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  const acceptsHtml = request.headers.get('Accept')?.includes('text/html');
  const isNavigation = request.mode === 'navigate';

  if (acceptsHtml || isNavigation) {
    // HTML / navigation → Network-first so new deploys are always picked up.
    // Falls back to stale cache only when the network is unreachable.
    event.respondWith(networkFirstForHTML(request));
    return;
  }

  // Assets and everything else → Cache-first (fast, works offline)
  event.respondWith(cacheFirstWithNetworkFallback(request));
});

// ── Strategies ────────────────────────────────────────────────────────────────

/**
 * Network-first for HTML.
 * Always tries the network so fresh index.html is served after each deploy.
 * On network failure, falls back to whatever is in the cache (or an offline page).
 */
async function networkFirstForHTML(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      // Store the latest shell so it's available offline
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Offline — try the cached version
    const cached = await caches.match(request);
    if (cached) return cached;
    return offlineFallbackPage();
  }
}

/**
 * Cache-first for static assets (JS, CSS, fonts, images).
 * Vite hashes filenames so cached entries never go stale.
 */
async function cacheFirstWithNetworkFallback(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    // Only cache successful, non-opaque responses
    if (networkResponse.ok && networkResponse.type !== 'opaque') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

function offlineFallbackPage() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Football GM – Offline</title>
  <style>
    body { font-family: system-ui; display: flex; flex-direction: column;
           align-items: center; justify-content: center; height: 100vh;
           margin: 0; background: #0a0c10; color: #fff; text-align: center; }
    h1 { font-size: 2rem; margin-bottom: .5rem; }
    p  { color: #aaa; }
    button { margin-top: 1.5rem; padding: .75rem 2rem; font-size: 1rem;
             background: #1976d2; color: #fff; border: none; border-radius: 4px;
             cursor: pointer; }
  </style>
</head>
<body>
  <h1>Football GM</h1>
  <p>You're offline. Reload once you have a connection to resume playing.</p>
  <button onclick="location.reload()">Try again</button>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ── Message handling ──────────────────────────────────────────────────────────

/**
 * The app can send { type: 'SKIP_WAITING' } to force an update mid-session.
 * Used by the "Update Now" button in the React app.
 */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
