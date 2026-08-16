/**
 * The page's half of offline. Registers the worker (production only, so nothing
 * sits between the dev server and a reload) and reports every same-origin
 * resource the page loaded.
 *
 * That report is why the worker needs no asset list: on a first visit bundle,
 * font and samples are requested before the worker has control, so its fetch
 * handler never sees them — but the resource timeline knows their hashed URLs.
 * One online visit caches everything, no filenames written at build time.
 */

/**
 * The worker sits beside the entry document — site root, or a GitHub Pages
 * subdirectory. Scope follows its location, so only this path knows the
 * difference.
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

  // After load, so registering never competes with first paint.
  window.addEventListener('load', () => void register());
}

async function register(): Promise<void> {
  try {
    await navigator.serviceWorker.register(WORKER);
    reportLoadedResources(await navigator.serviceWorker.ready);
  } catch {
    // No worker means no offline support — no reason to break the app for
    // someone online right now.
  }
}

/** Streams every fetched URL to the worker, including pre-existing ones. */
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
