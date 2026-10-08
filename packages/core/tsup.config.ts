import { defineConfig } from 'tsup';

export default defineConfig({
  // voice 是叶子域（仅依赖外部包，不被 core 其他域引用），独立成入口：
  // 它不聚合进根 barrel（隔离 sherpa-onnx-node 原生模块图），子路径生产条件
  // 指向本入口产物 dist/voice.*；与 index 之间无内部共享代码，不存在多 chunk 类身份副本。
  entry: {
    index: 'src/index.ts',
    voice: 'src/voice/index.ts',
  },
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
