import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * v1.1 M5（docs/plan/v1.1/02 §6 覆盖率分级门禁）：
 * web 不设全局门槛（整体水位 56%），仅对三个关键域卡 60% statements/lines。
 * 设门槛时实测水位：lib/server 64% / features/voice 67% / features/chat 80%。
 * 其余包与其余目录只出报告不阻断。
 */
const coverage = {
  provider: 'v8' as const,
  include: ['src/**/*.{ts,tsx}'],
  exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts'],
  thresholds: {
    '**/src/lib/server/**': { statements: 60, lines: 60 },
    '**/src/features/chat/**': { statements: 60, lines: 60 },
    '**/src/features/voice/**': { statements: 60, lines: 60 },
  },
};

export default defineConfig({
  resolve: {
    conditions: ['development'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    coverage,
  },
});
