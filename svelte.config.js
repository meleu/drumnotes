import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/vite-plugin-svelte').SvelteConfig} */
export default {
  // TypeScript in `<script lang="ts">`. Also read by eslint.config.js, which
  // needs the same preprocessor.
  preprocess: vitePreprocess(),
};
