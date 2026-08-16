/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

/**
 * Where the app is served from. Root by default (dev, preview, browser suite);
 * CI overrides it for the Pages build. Every URL derives from here.
 *
 * Trailing slash forced, not assumed: Vite adds one to URLs it rewrites, but
 * `import.meta.env.BASE_URL` reaches the app verbatim, and appenders like
 * `sw-register` would otherwise build `/drumnotessw.js`.
 */
const base = (process.env.BASE_PATH ?? '/').replace(/\/?$/, '/');

export default defineConfig({
  base,
  plugins: [svelte()],
  test: {
    // Unit tests sit beside the pure modules they cover; tests/e2e is outside
    // this glob on purpose.
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Every source file, not just imported ones, so an untested module reads
      // as a zero rather than vanishing. Unit suite only — Playwright is not
      // instrumented, so adapters/components/state read as uncovered. Watch
      // `src/core`.
      include: ['src/**'],
      reporter: ['text', 'html'],
    },
  },
});
