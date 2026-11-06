import { defineConfig } from 'vitest/config';

/** v1.0 voice 包：纯逻辑覆盖率门槛与其他包一致 */
const coverage = {
  provider: 'v8' as const,
  include: ['src/**/*.ts'],
  exclude: ['src/**/*.test.ts', 'src/**/index.ts', 'src/engine/sherpa/**'],
  thresholds: { statements: 70, lines: 70 },
};

export default defineConfig({
  resolve: {
    conditions: ['development'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Windows CI 慢机 + Turbo 并行时用例可能超过默认 5s，统一放宽避免误报
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage,
  },
});
