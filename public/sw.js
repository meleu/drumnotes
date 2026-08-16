/**
 * Hand-written service worker: no plugin, no dependency.
 *
 * Runtime caching, only the entry document precached — needs no build-time asset
 * list, since bundle, font and samples all get content-hashed names.
 *
 * - Hashed assets are immutable: cache-first, cached on first ask.
 * - The entry document is not (it names the build's hashes): precached on
 *   install, refreshed on activation, network-first so a redeploy is picked up.
 *
 * The page also reports what it loaded (`sw-register.ts`), which is what makes
 * one online visit enough: requests made before this worker had control were
 * never seen by the fetch handler.
 */

/** Bump on caching-behaviour change; other names dropped on activation. */
const CACHE = 'drumnotes-v1';

/**
 * The entry document, under the URL a navigation asks for. Copied verbatim, not
 * bundled, so it cannot read the build's base path and uses its own location:
 * this file ships beside the document it serves — `/`, or `/drumnotes/` on
 * Pages — which is also this worker's scope.
 */
const ENTRY = new URL('./', self.location.href).pathname;

/**
 * `Vary` ignored on purpose: the server varies on `Origin`, the build's tags are
 * `crossorigin` so browser requests carry that header and ours do not — every
 * hashed asset would miss. A hashed URL names one body anyway.
 */
const LOOKUP = { ignoreVary: true };

self.addEventListener('install', (event) => {
  // No waiting room: only one version is ever open, and a worker idle until
  // every tab closes never runs.
  event.waitUntil(refreshEntry().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(activate());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(request.mode === 'navigate' ? entry(request) : asset(request));
});

self.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || message.type !== 'cache' || !Array.isArray(message.urls)) return;

  event.waitUntil(warm(message.urls));
});

async function activate() {
  await refreshEntry();

  const names = await caches.keys();
  await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));

  // Claim the registering page, so its first visit also fills the cache.
  await self.clients.claim();
}

/** Fetches the entry document past every cache; stores it as fallback. */
async function refreshEntry() {
  const cache = await caches.open(CACHE);
  await cache.add(new Request(ENTRY, { cache: 'reload' }));
}

/** The document: network first, so a deploy is seen at once; falls back to the
 *  last copy that arrived. */
async function entry(request) {
  try {
    const response = await fetch(request);
    if (response.ok) await store(request, response);
    return response;
  } catch (offline) {
    const fallback = await caches.match(ENTRY, LOOKUP);
    if (fallback) return fallback;
    throw offline;
  }
}

/** Everything else: cache first, since a hashed name means one body. */
async function asset(request) {
  const hit = await caches.match(request, LOOKUP);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok) await store(request, response);
  return response;
}

/** Caches what the page loaded before this worker saw it. Already-held entries
 *  are left alone, so later visits cost nothing. */
async function warm(urls) {
  const cache = await caches.open(CACHE);

  await Promise.all(
    urls.map(async (url) => {
      if (new URL(url, self.location.origin).origin !== self.location.origin) return;
      if (await cache.match(url, LOOKUP)) return;

      try {
        const response = await fetch(url);
        if (response.ok) await cache.put(url, response);
      } catch {
        // Offline or gone; the next visit retries.
      }
    }),
  );
}

/** Stores a copy. Skips opaque and error responses: this cache is never
 *  revalidated, so caching one serves it forever. */
async function store(request, response) {
  if (response.type !== 'basic') return;

  const cache = await caches.open(CACHE);
  await cache.put(request.mode === 'navigate' ? ENTRY : request, response.clone());
}
