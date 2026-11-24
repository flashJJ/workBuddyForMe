/**
 * Nightly 变异测试（质量工程专项 E）：可靠性域热点文件。
 * 只有 Nightly 跑；阈值先观察（break: null），达标后再逐步升级为阻断。
 */
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'stryker.vitest.config.ts',
  },
  mutate: [
    'packages/core/src/flow/reliability/compensation-service.ts',
    'packages/core/src/flow/reliability/failure-classifier.ts',
    'packages/core/src/flow/reliability/retention-service.ts',
    'packages/core/src/flow/reliability/run-replay-service.ts',
    'packages/core/src/flow/reliability/run-snapshot.ts',
    'packages/core/src/flow/reliability/runtime-health-service.ts',
  ],
  reporters: ['clear-text', 'progress', 'json', 'html'],
  jsonReporter: { fileName: 'reports/mutation/reliability.json' },
  htmlReporter: { fileName: 'reports/mutation/reliability.html' },
  coverageAnalysis: 'perTest',
  concurrency: 2,
  timeoutMS: 60_000,
  thresholds: { high: 80, low: 40, break: null },
  // 沙箱只保留运行可靠性测试所需源码：apps/docs/blog/tests 与依赖目录一律不复制
  ignorePatterns: [
    '**/node_modules',
    '**/dist',
    '**/.next',
    '**/coverage',
    '.git',
    '.tmp',
    '.turbo',
    'apps',
    'docs',
    'blog',
    'tests',
    'resources',
    'release',
    'test-results',
    'reports',
    '**/*.md',
  ],
  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
};
