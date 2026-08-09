/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

/**
 * Where the app is served from. Root by default (dev server, preview, browser
 * suite); CI overrides it for the Pages build. Every URL derives from here, so
 * neither case is special at runtime.
 *
 * Trailing slash forced, not assumed: Vite adds one to URLs it rewrites, but
 * `import.meta.env.BASE_URL` reaches the app verbatim, and code that appends to
 * it — `sw-register` — would otherwise build `/drumnotessw.js`.
 */
const base = (process.env.BASE_PATH ?? '/').replace(/\/?$/, '/');

export default defineConfig({
  base,
  plugins: [svelte()],
  test: {
    // Unit tests sit beside the pure modules they cover; tests/e2e is
    // deliberately outside this glob.
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Every source file, not only imported ones, so an untested module reads
      // as a zero rather than vanishing.
      //
      // Unit suite only — Playwright is not instrumented, so adapters,
      // components and state read as uncovered. Watch `src/core`.
      include: ['src/**'],
      reporter: ['text', 'html'],
    },
  },
});
