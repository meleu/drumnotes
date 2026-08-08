/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  test: {
    // Unit tests live beside the pure modules they cover. The Playwright suite
    // under tests/e2e is deliberately outside this glob.
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Reports every source file, not only the ones a test imports, so an
      // untested module shows up as a zero rather than vanishing.
      //
      // This measures the unit suite alone — the Playwright suite is not
      // instrumented. Adapters, components and the reactive state therefore
      // read as uncovered here even though the browser tests exercise them;
      // the number to watch is `src/core`.
      include: ['src/**'],
      reporter: ['text', 'html'],
    },
  },
});
