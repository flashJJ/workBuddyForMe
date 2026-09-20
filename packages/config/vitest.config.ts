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
    // 消费 workspace 包的 development 条件（TS 源码）
    conditions: ['development'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage,
  },
});
