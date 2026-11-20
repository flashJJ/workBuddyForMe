import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { FIXTURE_PORT, FIXTURE_URL, findRepoRoot } from '../../tests/e2e/network-fixture';

/** 默认 42339（避开 3000 与常用端口）；本机端口被占用时可设 WBFM_E2E_PORT 覆盖（CI 不需要） */
const PORT = Number(process.env.WBFM_E2E_PORT ?? 42339);
const baseURL = `http://127.0.0.1:${PORT}`;
/** 每次全量运行使用独立临时数据根，天然隔离 */
const dataRoot = mkdtempSync(join(tmpdir(), 'wbfm-e2e-'));
/** v4.11 P1：联网验收场景文件（{{FIXTURE}} 在配置加载时替换为夹具地址） */
const repoRoot = findRepoRoot();
const scenarioDir = mkdtempSync(join(tmpdir(), 'wbfm-e2e-scenario-'));
const scenarioPath = join(scenarioDir, 'scenario.json');
writeFileSync(
  scenarioPath,
  readFileSync(join(repoRoot, 'tests', 'scenarios', 'v4.11-tool-harness.json'), 'utf-8').replaceAll(
    '{{FIXTURE}}',
    FIXTURE_URL,
  ),
  'utf-8',
);
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
  // CI 共享 runner 上懒加载/滚动类断言存在偶发抖动，有限重试降低误报
  retries: isCI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    // CI 失败摘要与 flaky 统计读取 junit（scripts/e2e/summarize-failures.mjs）
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: `node scripts/fixtures/web/server.mjs --port=${FIXTURE_PORT}`,
      cwd: repoRoot,
      url: `${FIXTURE_URL}/__stats`,
      reuseExistingServer: !isCI,
      timeout: 30_000,
    },
    {
      command: serverCmd,
      url: `${baseURL}/api/health`,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      env: {
        ...process.env,
        WBFM_MOCK_AI: '1',
        WBFM_DATA_ROOT: dataRoot,
        // v4.11 P1：场景化 mock 与回环抓取放行仅限 E2E 服务进程
        WBFM_MOCK_SCENARIO: scenarioPath,
        WBFM_FETCH_ALLOW_PRIVATE: '1',
      },
    },
  ],
});
