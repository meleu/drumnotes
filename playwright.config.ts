import { defineConfig, devices } from '@playwright/test';

const DEV_PORT = 5173;
const BUILD_PORT = 5174;

const dev = `http://localhost:${DEV_PORT}`;
const build = `http://localhost:${BUILD_PORT}`;

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
      command: `pnpm run build && pnpm exec vite preview --port ${BUILD_PORT} --strictPort`,
      url: build,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
