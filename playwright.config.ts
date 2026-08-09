import { defineConfig, devices } from '@playwright/test';

const DEV_PORT = 5173;
const BUILD_PORT = 5174;

/**
 * The build is previewed under a subdirectory rather than at a root, because
 * that is the shape GitHub Pages serves and the one worth guarding: a root-only
 * suite stays green while a subdirectory deploy is broken. The name is
 * deliberately not the repository's — nothing here may depend on which
 * subdirectory it is.
 *
 * It has no trailing slash, which is not an oversight: that is the form the
 * Pages API reports and hands to the deploy, and the form that has to survive
 * being appended to.
 */
const BASE = '/served-from-here';

const dev = `http://localhost:${DEV_PORT}`;
const build = `http://localhost:${BUILD_PORT}${BASE}/`;

// Most of the browser suite runs against the dev server rather than a production
// build, so a failure points at source rather than at bundled output.
//
// The service worker is the one thing that cannot be seen from there: it is
// registered only in a production build, deliberately, so that it never sits
// between the dev server and a reload. Its tests therefore get their own
// project, pointed at a preview of the real build.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
  // A single browser: these tests assert on DOM structure and counts, never on
  // pixels, so a second engine would only cost time.
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
      // The base is given to the preview as well as to the build: the server
      // serves from it, so it has to be told the same thing the bundle was.
      command: `BASE_PATH=${BASE} pnpm run build && BASE_PATH=${BASE} pnpm exec vite preview --port ${BUILD_PORT} --strictPort`,
      url: build,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
