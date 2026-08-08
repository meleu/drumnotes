import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/vite-plugin-svelte').SvelteConfig} */
export default {
  // TypeScript in `<script lang="ts">` blocks. Also read by eslint.config.js,
  // which needs the same preprocessor to lint Svelte files.
  preprocess: vitePreprocess(),
};
