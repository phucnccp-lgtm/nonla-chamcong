/* Service worker của vỏ app Nón Lá Coffee:
   lưu sẵn vỏ app (logo, màn hình chờ) để mở nhanh và vẫn hiện thông báo khi mất mạng.
   Dữ liệu chấm công luôn lấy trực tiếp từ Google, không lưu ở đây. */
var CACHE = 'nonla-shell-v2';
var FILES = ['./', 'index.html', 'manifest.webmanifest',
  'icons/logo-256.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-48.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // không đụng tới Google
  e.respondWith(
    fetch(e.request).then(function (res) {           // ưu tiên bản mới nhất trên mạng
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {                            // mất mạng → dùng bản đã lưu
      return caches.match(e.request).then(function (r) { return r || caches.match('index.html'); });
    })
  );
});
