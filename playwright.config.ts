import { defineConfig, devices } from '@playwright/test';

const DEV_PORT = 5173;
const BUILD_PORT = 5174;

/**
 * Previewed under a subdirectory: the shape Pages serves, and the one worth
 * guarding — a root-only suite stays green while a subdirectory deploy is
 * broken. Not the repo's name, since nothing may depend on which subdirectory it
 * is. No trailing slash: the form the Pages API reports, and the one that must
 * survive being appended to.
 */
const BASE = '/served-from-here';

const dev = `http://localhost:${DEV_PORT}`;
const build = `http://localhost:${BUILD_PORT}${BASE}/`;

// Most of the suite runs against the dev server, so failures point at source,
// not bundled output. The service worker (production-only) is the exception: its
// tests get their own project, against a preview of the real build.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
  // One browser: these assert on DOM structure and counts, never pixels.
  projects: [
    {
      name: 'chromium',
      testIgnore: /offline\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: dev },
    },
    {
      name: 'offline',
      testMatch: /offline\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: build },
    },
  ],
  webServer: [
    {
      command: `pnpm exec vite --port ${DEV_PORT} --strictPort`,
      url: dev,
      reuseExistingServer: !process.env.CI,
    },
    {
      // The base goes to preview as well as build: the server serves from it,
      // so it must be told what the bundle was.
      command: `BASE_PATH=${BASE} pnpm run build && BASE_PATH=${BASE} pnpm exec vite preview --port ${BUILD_PORT} --strictPort`,
      url: build,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
