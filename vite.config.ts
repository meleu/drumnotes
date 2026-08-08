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
  },
});
