const SHELL_CACHE = 'buildpro-shell-v1';
const ASSET_CACHE = 'buildpro-assets-v1';

// Static file extensions to cache at runtime (cache-first)
const CACHEABLE_EXT = /\.(js|css|svg|png|jpg|jpeg|webp|woff2?|ico)(\?.*)?$/;

// ── Install: pre-cache the app shell (HTML entry point only) ──────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  // Skip aggressive caching on localhost so HMR keeps working
  const isDev =
    self.location.hostname === 'localhost' ||
    self.location.hostname.endsWith('.replit.dev');
  if (isDev) return;
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(['/']))
      .catch(() => {})
  );
});

// ── Activate: clean up old caches ─────────────────────────────────────────
self.addEventListener('activate', event => {
  const currentCaches = [SHELL_CACHE, ASSET_CACHE];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !currentCaches.includes(k)).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: tiered caching strategy ────────────────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Skip API calls — always network
  if (url.pathname.startsWith('/api/')) return;

  // Hashed JS/CSS/image assets → cache-first (safe because filename hash changes on rebuild)
  if (CACHEABLE_EXT.test(url.pathname) || url.pathname.startsWith('/assets/')) {
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

  // HTML navigation → network-first with shell fallback for offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/').then(r => r || Response.error())
      )
    );
  }
});

// ── Push: receive server-sent push notifications ───────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'BuildPro', body: 'You have a new notification.' };
  try { data = event.data?.json() ?? data; } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: data.tag ?? 'buildpro-push',
    })
  );
});

// ── Notification click: focus or open the app ─────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(wins => {
        const open = wins.find(w => w.url.startsWith(self.location.origin) && 'focus' in w);
        return open ? open.focus() : clients.openWindow('/');
      })
  );
});
