// Service worker: ускоряет повторные загрузки на медленных сетях.
// Статика (JS/CSS/шрифты/картинки) — cache-first (мгновенно с устройства).
// HTML-страницы — network-first с фолбэком на кэш при обрыве сети.

const STATIC_CACHE = "skm-static-v2";
const PAGE_CACHE = "skm-pages-v2";

const STATIC_PATTERNS = [/^\/_next\/static\//, /^\/_next\/image/, /\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|avif|ico)$/];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Никогда не кэшируем API, сессию и кабинет — там живые данные.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/account") || url.pathname.startsWith("/admin")) {
    return;
  }

  const isStatic = STATIC_PATTERNS.some((pattern) => pattern.test(url.pathname));

  if (isStatic) {
    // Cache-first: статика Next.js иммутабельна (хэш в имени файла).
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  // Страницы и RSC-данные: network-first с таймаутом, при обрыве — из кэша.
  const isPageLike = request.mode === "navigate" || request.headers.get("RSC") === "1";
  if (!isPageLike) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(PAGE_CACHE);
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(request, { signal: controller.signal });
        clearTimeout(timer);
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw new Error("offline");
      }
    })(),
  );
});
