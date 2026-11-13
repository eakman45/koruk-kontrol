// Çevrimdışı çalışma: uygulama dosyaları ilk açılışta önbelleğe alınır.
const VERSION = "koruk-1.0.1";
const FILES = [
  "./", "index.html", "css/app.css", "manifest.webmanifest",
  "js/app.js", "js/config.js", "js/label.js", "js/parser.js", "js/rules.js", "js/scanner.js", "js/store.js", "js/audio.js",
  "vendor/pdf.min.js", "vendor/pdf.worker.min.js", "vendor/zxing-reader.js", "vendor/zxing_reader.wasm",
  "icons/icon-180.png", "icons/icon-512.png",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Önce ağ (güncel sürüm), ağ yoksa önbellek
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
