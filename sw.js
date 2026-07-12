const CACHE = "reacbill-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Navegación/HTML: red primero (para no quedar pegado en una versión vieja),
// con la copia cacheada como respaldo si no hay conexión.
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.mode === "navigate" || (req.method === "GET" && req.url.includes("index.html"))) {
    e.respondWith(
      fetch(req).then(res => {
        caches.open(CACHE).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
    return;
  }
  // Resto (íconos, manifest, librerías CDN): cache primero, red de respaldo.
  if (req.method === "GET") {
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => cached))
    );
  }
});
