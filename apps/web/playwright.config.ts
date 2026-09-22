import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;
/** 每次全量运行使用独立临时数据根，天然隔离 */
const dataRoot = mkdtempSync(join(tmpdir(), 'wbfm-e2e-'));
/** CI 用 next start（上游 pnpm build:web 已产出 .next），本地用 next dev 热启 */
const isCI = process.env.GITHUB_ACTIONS === 'true';
const serverCmd = isCI
  ? `pnpm --filter @wbfm/web exec next start -H 127.0.0.1 -p ${PORT}`
  : `pnpm exec next dev -H 127.0.0.1 -p ${PORT}`;

export default defineConfig({
  testDir: '../../tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: serverCmd,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    env: {
      ...process.env,
      WBFM_MOCK_AI: '1',
      WBFM_DATA_ROOT: dataRoot,
    },
  },
});
