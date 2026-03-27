// Derive base path from the registered scope so the SW works at any base URL.
// e.g. scope "https://example.com/" → base "/"
//      scope "https://example.com/contractor/" → base "/contractor/"
const base = new URL(self.registration.scope).pathname; // ends with "/"

const SHELL_CACHE  = 'buildpro-shell-v1';
const ASSET_CACHE  = 'buildpro-assets-v1';

// Static file extensions to cache at runtime (cache-first)
const CACHEABLE_EXT = /\.(js|css|svg|png|jpg|jpeg|webp|woff2?|ico)(\?.*)?$/;

// ── Install: pre-cache the app shell entry point ───────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  // Skip caching on localhost/dev hosts to avoid breaking HMR
  const isDev =
    self.location.hostname === 'localhost' ||
    self.location.hostname.endsWith('.replit.dev');
  if (isDev) return;
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll([base]))
      .catch(() => {})
  );
});

// ── Activate: clean up old caches ─────────────────────────────────────────
self.addEventListener('activate', event => {
  const current = [SHELL_CACHE, ASSET_CACHE];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !current.includes(k)).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: tiered caching strategy ────────────────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Skip API calls — always network
  if (url.pathname.startsWith(base + 'api/')) return;

  // Hashed JS/CSS/image assets → cache-first
  // (safe because Vite content-hashes filenames, so stale entries are harmless)
  if (
    CACHEABLE_EXT.test(url.pathname) ||
    url.pathname.startsWith(base + 'assets/')
  ) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // HTML navigation requests → network-first with cached shell fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(base).then(r => r || Response.error())
      )
    );
  }
});

// ── Push: receive server-sent push notifications ───────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'BuildPro', body: 'You have a new notification.' };
  try { data = event.data?.json() ?? data; } catch (_) {}
  const iconUrl = self.location.origin + base + 'favicon.svg';
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: iconUrl,
      badge: iconUrl,
      tag: data.tag ?? 'buildpro-push',
    })
  );
});

// ── Notification click: focus or open the app ─────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const appUrl = self.location.origin + base;
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(wins => {
        const open = wins.find(w => w.url.startsWith(appUrl) && 'focus' in w);
        return open ? open.focus() : clients.openWindow(appUrl);
      })
  );
});
