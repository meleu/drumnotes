/**
 * The page's half of the offline story. Two quiet jobs: register the worker (in
 * production only, so nothing sits between the dev server and a reload), and
 * report every same-origin resource the page loaded.
 *
 * That report is why the worker needs no asset list. On a first visit the
 * bundle, font and samples are all requested before the worker has control, so
 * its fetch handler never sees them — but the browser's resource timeline knows
 * their hashed URLs. One online visit caches everything, no filenames written
 * down at build time.
 */

/**
 * The worker sits next to the entry document, wherever that is — site root, or a
 * subdirectory on GitHub Pages. Scope follows its own location, so this path is
 * all that needs to know the difference.
 */
const WORKER = `${import.meta.env.BASE_URL}sw.js`;

/** How the worker hears about a resource loaded without it. */
interface CacheMessage {
  readonly type: 'cache';
  readonly urls: readonly string[];
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  // After load, so registering never competes with the first paint.
  window.addEventListener('load', () => void register());
}

async function register(): Promise<void> {
  try {
    await navigator.serviceWorker.register(WORKER);
    reportLoadedResources(await navigator.serviceWorker.ready);
  } catch {
    // No worker means no offline support — no reason to break the app for
    // someone who is online right now.
  }
}

/** Streams every fetched URL to the worker, starting with those fetched before
 *  this ran. */
function reportLoadedResources(registration: ServiceWorkerRegistration): void {
  const worker = registration.active;
  if (!worker) return;

  const send = (entries: PerformanceEntryList): void => {
    const urls = entries
      .map((entry) => entry.name)
      .filter((url) => new URL(url, location.href).origin === location.origin);

    if (urls.length > 0) worker.postMessage({ type: 'cache', urls } satisfies CacheMessage);
  };

  new PerformanceObserver((list) => send(list.getEntries())).observe({
    type: 'resource',
    buffered: true,
  });
}
