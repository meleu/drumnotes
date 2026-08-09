/**
 * drumnotes' service worker: hand-written, no plugin, no dependency.
 *
 * The strategy is runtime caching with only the entry document precached, and
 * it was chosen for one reason: it needs no build-time asset list. The bundle,
 * the music font and the samples all arrive under content-hashed names that
 * change on every build, and nothing here has to know a single one of them.
 *
 * - Hashed assets are immutable, so they are served cache-first and cached on
 *   the way back the first time they are asked for.
 * - The entry document is not immutable — it is the file that names the current
 *   build's hashes. It is precached on install, refreshed on activation, and
 *   served network-first so a redeploy is picked up on the next load rather
 *   than pinned until this file happens to change.
 *
 * The page also tells the worker what it loaded (see `sw-register.ts`), which
 * is what makes a single online visit enough: requests made before the worker
 * took control were never seen by the fetch handler, and this is how they get
 * into the cache anyway — still without anyone writing down a filename.
 */

/**
 * Bump this when the caching behaviour changes. Everything under another name
 * is deleted on activation, so an old worker's leftovers never mix with a new
 * one's.
 */
const CACHE = 'drumnotes-v1';

/**
 * The entry document, cached under the URL a navigation actually asks for.
 *
 * This file is copied verbatim rather than bundled, so it cannot read the
 * build's base path — it reads its own location instead. The worker ships
 * beside the document it serves, so the directory holding this file is that
 * document: `/` when the site is served from a root, `/drumnotes/` on GitHub
 * Pages. That is also exactly the worker's scope, so nothing outside it is
 * ever claimed by mistake.
 */
const ENTRY = new URL('./', self.location.href).pathname;

/**
 * How a cached copy is looked up. `Vary` is ignored deliberately: the server
 * varies its assets on `Origin`, the build's tags are `crossorigin` so the
 * browser's own requests carry that header, and a copy fetched from in here
 * does not — which would make every hashed asset miss. A hashed URL names
 * exactly one body, so there is nothing for `Vary` to protect.
 */
const LOOKUP = { ignoreVary: true };

self.addEventListener('install', (event) => {
  // No waiting room: there is only ever one version of this app open, and a
  // worker that sits idle until every tab closes is a worker that never runs.
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

  // Claim the page that registered this worker, so its first visit is also the
  // visit that fills the cache.
  await self.clients.claim();
}

/** Fetches the entry document past every cache and stores it as the fallback. */
async function refreshEntry() {
  const cache = await caches.open(CACHE);
  await cache.add(new Request(ENTRY, { cache: 'reload' }));
}

/**
 * The document: network first, so a new deploy is seen immediately, falling
 * back to the last copy that arrived when there is no network to ask.
 */
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

/** Everything else: cache first, since a hashed name never means two things. */
async function asset(request) {
  const hit = await caches.match(request, LOOKUP);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok) await store(request, response);
  return response;
}

/**
 * Caches what the page loaded before this worker was in a position to see it.
 * Anything already held is left alone, so this costs nothing on later visits.
 */
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
        // Offline, or the asset has gone. Either way the next visit tries again.
      }
    }),
  );
}

/**
 * Stores a copy of a response. Opaque and error responses are skipped: caching
 * one would mean serving it forever from a cache that is never revalidated.
 */
async function store(request, response) {
  if (response.type !== 'basic') return;

  const cache = await caches.open(CACHE);
  await cache.put(request.mode === 'navigate' ? ENTRY : request, response.clone());
}
