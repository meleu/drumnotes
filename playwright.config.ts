import { defineConfig, devices } from '@playwright/test';

const DEV_PORT = 5173;
const BUILD_PORT = 5174;

/**
 * Previewed under a subdirectory, because that is the shape Pages serves and the
 * one worth guarding: a root-only suite stays green while a subdirectory deploy
 * is broken. Deliberately not the repository's name — nothing may depend on
 * which subdirectory it is.
 *
 * No trailing slash, on purpose: that is the form the Pages API reports, and the
 * form that has to survive being appended to.
 */
const BASE = '/served-from-here';

const dev = `http://localhost:${DEV_PORT}`;
const build = `http://localhost:${BUILD_PORT}${BASE}/`;

// Most of the suite runs against the dev server, so a failure points at source
// rather than bundled output. The service worker is the exception — registered
// only in a production build — so its tests get their own project, pointed at a
// preview of the real build.
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
      // The base goes to the preview as well as the build: the server serves
      // from it, so it must be told what the bundle was.
      command: `BASE_PATH=${BASE} pnpm run build && BASE_PATH=${BASE} pnpm exec vite preview --port ${BUILD_PORT} --strictPort`,
      url: build,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
