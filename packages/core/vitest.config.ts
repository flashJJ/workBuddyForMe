import { defineConfig } from 'vitest/config';

/** TR-32.1：核心包覆盖率门槛（statements/lines ≥70%） */
const coverage = {
  provider: 'v8' as const,
  include: ['src/**/*.ts'],
  exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
  thresholds: {
    statements: 70,
    lines: 70,
    // v1.1 M5（02 §6 分级门禁）：工具结果中央压缩层是纯函数核心模块，独立 95% 硬门槛
    '**/tools/tool-result-compact.ts': {
      statements: 95,
      lines: 95,
      functions: 95,
      branches: 95,
    },
  },
};

export default defineConfig({
  resolve: {
    conditions: ['development'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage,
  },
});
