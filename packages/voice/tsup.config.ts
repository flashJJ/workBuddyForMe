import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  sourcemap: true,
  clean: true,
  dts: false,
  // sherpa-onnx-node 等原生绑定始终外部化，由消费方（Next/Electron）解析
  external: [/^@wbfm\//, 'sherpa-onnx-node'],
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.mjs' }),
});
