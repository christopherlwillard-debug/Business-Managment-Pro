const CACHE_NAME = 'buildpro-shell-v1';
const SHELL_URLS = ['/', '/index.html'];

// ── Install: pre-cache the app shell ──────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  // Skip caching in local dev to avoid breaking HMR
  const isDev = self.location.hostname === 'localhost' ||
    self.location.hostname.endsWith('.replit.dev');
  if (isDev) return;
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS)).catch(() => {})
  );
});

// ── Activate: clean up old caches ─────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for HTML, skip API calls ─────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Don't intercept API calls
  if (url.pathname.startsWith('/api/')) return;
  // Offline fallback for HTML navigation requests
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/index.html').then(r => r || Response.error())
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
