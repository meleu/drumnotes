/**
 * The page's half of the offline story.
 *
 * Two jobs, and both of them are deliberately quiet. It registers the worker —
 * in a production build only, so nothing ever sits between the dev server and a
 * reload — and it reports back every same-origin resource the page actually
 * loaded.
 *
 * That report is what lets the worker hold no asset list. On a first visit the
 * bundle, the font and the samples are all requested before the worker is in
 * control, so its fetch handler never sees them; the browser's own resource
 * timeline knows their hashed URLs, and hands them over. One online visit ends
 * with everything cached, and no build step ever writes a filename down.
 */

/**
 * The worker sits next to the entry document, wherever that turns out to be —
 * the site root when served from one, a subdirectory on GitHub Pages. Its
 * registration scope follows its own location, so this one path is all that
 * needs to know the difference.
 */
const WORKER = `${import.meta.env.BASE_URL}sw.js`;

/** How the worker is told about a resource the page loaded without it. */
interface CacheMessage {
  readonly type: 'cache';
  readonly urls: readonly string[];
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  // After load, so registering never competes with the app's own first paint.
  window.addEventListener('load', () => void register());
}

async function register(): Promise<void> {
  try {
    await navigator.serviceWorker.register(WORKER);
    reportLoadedResources(await navigator.serviceWorker.ready);
  } catch {
    // No worker means no offline support, which is not a reason to break the
    // app for someone who is online right now.
  }
}

/**
 * Streams the URL of everything the page fetches to the worker, starting with
 * whatever it had already fetched before this ran.
 */
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
