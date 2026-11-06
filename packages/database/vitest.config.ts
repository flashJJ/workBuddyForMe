import { defineConfig } from 'vitest/config';

/** TR-32.1：核心包覆盖率门槛（statements/lines ≥70%） */
const coverage = {
  provider: 'v8' as const,
  include: ['src/**/*.ts'],
  exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
  thresholds: { statements: 70, lines: 70 },
};

export default defineConfig({
  resolve: {
    conditions: ['development'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // 建库 + 迁移在 Windows CI 慢机上偶发超过默认 5s，放宽到 20s
    testTimeout: 20_000,
    coverage,
  },
});
