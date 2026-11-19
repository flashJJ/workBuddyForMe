import { defineConfig } from '@playwright/test';
import { FIXTURE_PORT, FIXTURE_URL, REPO_ROOT } from './e2e/network-fixture';

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // v4.11 P1-3：联网冒烟用 Fake Web；Electron 子进程的场景 env 由规格注入
  webServer: {
    command: `node scripts/fixtures/web/server.mjs --port=${FIXTURE_PORT}`,
    cwd: REPO_ROOT,
    url: `${FIXTURE_URL}/__stats`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
