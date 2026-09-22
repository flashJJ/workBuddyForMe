import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/main/index.ts',
    'preload/index': 'src/preload/index.ts',
  },
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  clean: true,
  // electron 运行时自带；electron-updater 作为 production 依赖由 electron-builder
  // 归集进 asar 的 node_modules（含 fs-extra/js-yaml/semver 等传递依赖）
  external: ['electron', 'electron-updater'],
});
