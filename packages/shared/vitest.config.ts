import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Windows CI 慢机 + Turbo 并行时用例可能超过默认 5s，统一放宽避免误报
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
