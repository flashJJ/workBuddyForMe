/* 根 ESLint 配置（classic config，供 packages 与脚本使用；apps/web 另行继承 next 配置） */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.next/',
    'out/',
    'coverage/',
    // Playwright 产物（trace viewer 自带大量打包 JS）
    '**/playwright-report/',
    '**/test-results/',
    // prepare-server 归集的 standalone 副本与 electron-builder 打包目录
    'apps/desktop/resources/',
    'apps/desktop/release*/',
    // 官方第三方压缩混淆库（Live2D Cubism Core）
    'apps/web/public/live2d/core/',
    'apps/web/.next/',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    {
      // Node 工具链：构建配置、根 scripts、ESLint 配置本身
      files: [
        '**/*.config.{js,cjs,mjs,ts}',
        '.eslintrc.cjs',
        'scripts/**/*.{js,cjs,mjs}',
      ],
      env: { node: true },
    },
    {
      // 桌面壳与各包的本地脚本、spike 取证、测试夹具（不进构建产物）
      files: [
        'apps/desktop/scripts/**/*.{js,cjs,mjs}',
        'apps/desktop/spikes/**/*.{js,cjs,mjs}',
        'packages/**/spikes/**/*.{js,cjs,mjs}',
        'packages/**/fixtures/**/*.{js,cjs,mjs}',
      ],
      env: { node: true },
      // Node 18+ 全局 fetch（旧版 globals 定义未包含）
      globals: { fetch: 'readonly' },
    },
  ],
};
