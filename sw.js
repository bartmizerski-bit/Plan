// Service worker — cache "powłoki" aplikacji (HTML/JS/manifest/ikony).
// Zapytania do API uczelni NIE są cache'owane (zawsze świeże dane).
const CACHE = "plan-apol-v1";
const POWLOKA = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(POWLOKA)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  // dane uczelni i proxy – zawsze z sieci
  if (u.host.includes("apol.edu.pl") || u.host.includes("corsproxy.io")) return;
  // powłoka – cache-first
  if (e.request.method === "GET" && u.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
        return resp;
      }).catch(() => r))
    );
  }
});
