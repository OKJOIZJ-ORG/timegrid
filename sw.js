const VERSION = "timegrid-v3.14.11-20260906";
const CACHE_PREFIX = "timegrid-";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./catalog-core.js",
  "./continuity-core.js",
  "./catalog-manager.js",
  "./catalog-manager.css",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/favicon.ico",
  "./brand/mark-96.png"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(APP_SHELL.map(url => new Request(url, {cache:"reload"})));
    // A CDN deployment can expose the new worker before the matching HTML.
    // Never activate a release whose cached document belongs to another build.
    for (const url of ["./", "./index.html"]) {
      const response = await cache.match(url);
      const html = response && await response.text();
      if (!html || !html.includes(`const BUILD_VERSION="${VERSION}";`)) {
        await caches.delete(SHELL_CACHE);
        throw new Error("TimeGrid shell version mismatch");
      }
    }
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== SHELL_CACHE && name !== RUNTIME_CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
  if (event.data && event.data.type === "GET_VERSION" && event.ports[0]) {
    event.ports[0].postMessage({version:VERSION});
  }
});

async function matchOwned(request) {
  const shell = await caches.open(SHELL_CACHE);
  const shellHit = await shell.match(request);
  if (shellHit) return shellHit;
  const runtime = await caches.open(RUNTIME_CACHE);
  return runtime.match(request);
}

async function cacheRuntime(request, response) {
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response.clone());
  } catch (_) {
    // A cache quota/storage failure must not discard a usable network response.
  }
  return response;
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // The worker owns static app files, never authentication or live data traffic.
  // Caching a streaming response waits for its body and keeps the old worker's
  // fetch event pending, preventing even skipWaiting from activating an update.
  if (url.origin !== self.location.origin) return;
  const scopePath = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scopePath)) return;
  if (request.mode !== "navigate" && !APP_SHELL.some(asset => new URL(asset, self.registration.scope).pathname === url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      // HTML and shared scripts must belong to the same activated shell.
      // Network-first HTML can repeatedly reopen an old update banner after reload.
      const shell = await caches.open(SHELL_CACHE);
      const installed = await shell.match("./index.html");
      if (installed) return installed;
      try {
        const fresh = await fetch(new Request(request, {cache:"reload"}));
        return cacheRuntime(request, fresh);
      } catch (_) {
        return (await matchOwned(request)) || (await matchOwned("./index.html"));
      }
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await matchOwned(request);
      if (cached) return cached;
      const fresh = await fetch(request);
      return cacheRuntime(request, fresh);
    })());
    return;
  }

});
