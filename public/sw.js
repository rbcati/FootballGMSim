/**
 * sw.js  —  Service Worker for Football GM
 *
 * Update strategy (ZenGM-standard):
 *  1. INSTALL:  Pre-cache shell assets.  Do NOT call skipWaiting() — the new
 *               SW waits in the "installed" state so the current session is
 *               never disrupted mid-game.
 *  2. ACTIVATE: Clean up stale caches, then claim all clients.
 *  3. FETCH:    Navigation (HTML) → Network-First so iOS PWA bookmarks always
 *               get fresh content after a Netlify deploy.
 *               Assets (JS/CSS/images) → Cache-First (Vite hashes filenames so
 *               new deploys always produce new URLs).
 *  4. MESSAGE:  Respond to { type: 'SKIP_WAITING' } sent by App.jsx when the
 *               user clicks the "Update & Reload" banner.
 *
 * Versioning:
 *  CACHE_NAME contains a build hash injected by the vite.config.js
 *  `injectSwVersion` plugin at build time.  In dev mode it stays as-is.
 *  Bumping the hash evicts all assets from the previous cache on activate.
 *
 * Netlify caching:
 *  public/_headers sets  Cache-Control: no-cache  on /sw.js so the browser
 *  always re-fetches this file and can detect new versions.
 */

// Injected by vite.config.js → injectSwVersion plugin during `vite build`.
// In development the literal string 'dev' is used.
const CACHE_NAME = 'fgm-dev';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// ── Install ───────────────────────────────────────────────────────────────────
// Pre-cache the app shell.  We deliberately do NOT call self.skipWaiting() so
// the existing SW continues serving the current session.  The new SW moves to
// the "waiting" state and App.jsx shows the "Update Available" banner.

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
// Delete every cache that isn't CACHE_NAME (i.e. from a previous build), then
// take control of all open clients so the new fetch handler is used immediately.

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept same-origin GETs
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  const isNavigation =
    request.mode === 'navigate' ||
    request.headers.get('Accept')?.includes('text/html');

  if (isNavigation) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

/**
 * Network-First — used for HTML/navigation requests.
 * Fetches fresh content on every load so an updated index.html (with new
 * hashed asset URLs) is always served.  Falls back to cache when offline.
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type !== 'opaque') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());  // background update
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? offlinePage();
  }
}

/**
 * Cache-First — used for Vite-hashed JS/CSS/asset files.
 * Content-addressed filenames mean a cache hit is always correct.
 * New deployments produce new filenames that miss the cache and are fetched
 * from the network, cached, and served.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && response.type !== 'opaque') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}

function offlinePage() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Football GM – Offline</title>
  <style>
    body{font-family:system-ui;display:flex;flex-direction:column;
         align-items:center;justify-content:center;height:100vh;
         margin:0;background:#0a0c10;color:#fff;text-align:center}
    h1{font-size:2rem;margin-bottom:.5rem}
    p{color:#aaa}
    button{margin-top:1.5rem;padding:.75rem 2rem;font-size:1rem;
           background:#1976d2;color:#fff;border:none;border-radius:4px;cursor:pointer}
  </style>
</head>
<body>
  <h1>Football GM</h1>
  <p>You're offline. Open the app once you have a connection to resume.</p>
  <button onclick="location.reload()">Try again</button>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ── Message handling ──────────────────────────────────────────────────────────
// App.jsx sends { type: 'SKIP_WAITING' } when the user clicks the
// "Update & Reload" banner.  This activates the waiting SW immediately,
// which triggers the `controllerchange` event in the page → hard reload.

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
