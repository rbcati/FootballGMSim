/**
 * sw.js  —  Service Worker for Football GM
 *
 * Strategy: Cache-first for all app shell assets (JS, CSS, HTML, fonts, icons).
 * Because this is a single-player offline game with no external API calls,
 * we simply precache everything on install and serve from cache on all requests.
 *
 * Versioning:
 *  - Bump CACHE_NAME whenever you deploy a new build.
 *  - Old caches are deleted in the activate phase so stale assets never run.
 *
 * Netlify-specific:
 *  - The `netlify.toml` (or _headers file) should set Cache-Control: no-cache
 *    on /sw.js itself so the browser always re-fetches it and can detect updates.
 *  - All other assets can have long-lived cache headers because the service
 *    worker acts as the true caching layer.
 */

const CACHE_NAME = 'football-gm-v1';

/**
 * Assets to precache on install.
 * Vite injects hashed filenames into the build; we cache everything under /assets/.
 * The root HTML + manifest are cached by name.
 */
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// ── Install ───────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache the known shell assets
      await cache.addAll(PRECACHE_URLS);
      // Skip waiting so the new SW activates immediately (no tab-reload required)
      self.skipWaiting();
    })
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
      // Take control of all open clients without requiring a page reload
      await self.clients.claim();
    })
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(cacheFirstWithNetworkFallback(request));
});

/**
 * Cache-first strategy:
 *  1. Return cached response if available.
 *  2. Otherwise fetch from network, cache the response, then return it.
 *  3. If network also fails (offline), return a minimal fallback.
 */
async function cacheFirstWithNetworkFallback(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);

    // Only cache successful, non-opaque responses
    if (networkResponse.ok && networkResponse.type !== 'opaque') {
      const cache = await caches.open(CACHE_NAME);
      // Clone because the response body can only be consumed once
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch {
    // Network failed and nothing in cache — return a minimal offline page
    // for navigation requests (HTML), or a 503 for sub-resources.
    const acceptsHtml = request.headers.get('Accept')?.includes('text/html');
    if (acceptsHtml) {
      return offlineFallbackPage();
    }
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
    status:  200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ── Message handling ──────────────────────────────────────────────────────────

/**
 * The app can send { type: 'SKIP_WAITING' } to force an update mid-session.
 * Useful for "New version available — update now?" prompts.
 */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
