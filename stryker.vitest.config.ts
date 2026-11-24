import { defineConfig } from 'vitest/config';

/**
 * 变异测试专用 vitest 配置（质量工程专项 E）。
 * 只跑可靠性域用例，并排除依赖真实文件库/密钥生成的重型自测场景，
 * 避免每个变异体都重复付出建库与验签成本。
 */
export default defineConfig({
  resolve: {
    conditions: ['development'],
  },
  test: {
    environment: 'node',
    include: ['packages/core/src/flow/reliability/**/*.test.ts'],
    exclude: ['packages/core/src/flow/reliability/__tests__/selftest-scenarios.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
