import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    contracts: 'src/contracts.ts',
    poses: 'src/poses/index.ts',
    motions: 'src/motions/index.ts',
    behaviors: 'src/behaviors/index.ts',
    content: 'src/content.ts',
  },
  format: ['esm', 'cjs'],
  sourcemap: true,
  clean: true,
  dts: false,
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.mjs' }),
  external: [/^@wbfm\//],
});
