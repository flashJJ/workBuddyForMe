import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  sourcemap: true,
  clean: true,
  dts: false,
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.mjs' }),
  // @napi-rs/canvas（原生 .node）与 tesseract.js（worker/wasm）必须保持外部 require，
  // 不能打进 bundle：内部相对路径与 worker 引导依赖真实包目录结构
  external: [
    /^@wbfm\//,
    'better-sqlite3',
    'sqlite-vec',
    /^@napi-rs\/canvas$/,
    /^tesseract\.js$/,
  ],
});
