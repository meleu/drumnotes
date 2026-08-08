import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;

// The browser suite runs against the dev server rather than a production build,
// so a failure points at source rather than at bundled output.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  // A single browser: these tests assert on DOM structure and counts, never on
  // pixels, so a second engine would only cost time.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
