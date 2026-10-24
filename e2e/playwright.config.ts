import { defineConfig, devices } from '@playwright/test';

const API_PORT = 3101;
const WEB_PORT = 5273;

export default defineConfig({
  testDir: './tests',
  // One shared in-memory API, reset before every test, so tests must not run in parallel.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'retain-on-failure' },
  expect: {
    // Strict per-pixel colour threshold (the 0.2 default misses subtle background changes) with a small
    // allowance for anti-aliasing noise.
    toHaveScreenshot: { threshold: 0.02, maxDiffPixelRatio: 0.002, animations: 'disabled' },
  },
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1000, height: 800 } } }],
  webServer: [
    {
      command: `pnpm --filter @learning/api exec tsx e2e/server.ts`,
      env: { PORT: String(API_PORT), NODE_ENV: 'test' },
      url: `http://127.0.0.1:${API_PORT}/api/learnings`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm --filter @learning/web exec vite --port ${WEB_PORT} --strictPort`,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
    },
  ],
});
