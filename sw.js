const CACHE = 'mizaj';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './favicon-64.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL).catch(() => c.addAll(['./', './index.html'])))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isDoc = req =>
  req.mode === 'navigate' ||
  req.destination === 'document' ||
  new URL(req.url).pathname.endsWith('index.html');

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (isDoc(req)) {
    e.respondWith((async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3500);
        const res = await fetch(req, { cache: 'no-store', signal: ctrl.signal });
        clearTimeout(timer);
        if (res && res.status === 200) {
          const c = await caches.open(CACHE);
          await c.put('./index.html', res.clone());
          notifyIfChanged(res.clone());
        }
        return res;
      } catch {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

let lastLen = null;
async function notifyIfChanged(res) {
  try {
    const text = await res.text();
    const len = text.length;
    if (lastLen !== null && len !== lastLen) {
      const cs = await self.clients.matchAll({ type: 'window' });
      cs.forEach(c => c.postMessage('updated'));
    }
    lastLen = len;
  } catch {}
}

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
