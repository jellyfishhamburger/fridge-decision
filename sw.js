const CACHE = "fridge-decision-v22";
const ASSETS = ["./manifest.json", "./icon.svg"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Only same-origin GETs are cached. The Supabase REST calls are cross-origin and
// MUST go to the network every time — caching them froze the cloud data forever.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  /* blob: / data: 这些不该经过缓存层 —— tesseract 的 worker 就是 blob，
     之前被 caches.match(blob) 拦了一把，直接 Failed to fetch。 */
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (url.origin !== self.location.origin) return;      // let the API straight through

  const path = url.pathname;
  // 文档、脚本、样式都必须网络优先：否则改了 cook.css，用户拿到的还是旧版（导航图标会失控）
  /* OCR 的大文件（core/traineddata）走缓存优先：一次下载 10 MB，别每次重新拉 */
  const isOCR = path.indexOf("/vendor/tesseract/") >= 0;
  const isDoc = !isOCR && (e.request.mode === "navigate" || /\.(html|js|css)$/.test(path));
  if (isDoc) {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match("./index.html")))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }))
  );
});
