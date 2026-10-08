/* 根 ESLint 配置（classic config，供 packages 与脚本使用；apps/web 另行继承 next 配置） */

/**
 * v1.1 M0 分层边界（docs/plan/v1.1/02 §1）：
 * - 方向 zone：下层包不得依赖上层包；packages 不得依赖 apps；desktop 壳不碰业务包
 * - internal zone：跨包/跨应用引用任何包的 src/**\/internal/** 均违规（同包与测试放行）
 * M0 阶段一律 warn，M5 翻 error；规则只防未来，现状核实零违例。
 *
 * 实现备注（eslint-plugin-import 2.32 行为约束）：
 * - 方向限制 from 用「非 glob 目录」：插件走 containsPath 语义，天然放行同包内相对导入；
 * - glob 分支的 except 不会被 path.resolve，故 internal zone 的 except 必须给绝对 glob；
 * - 路径相对本配置文件所在目录（仓库根）。
 */
const PACKAGES = ['shared', 'config', 'database', 'ai', 'voice', 'core'];
/** 依赖白名单（下游包）；未列入者即该包禁止的来源，逐目录生成 zone */
const ALLOWED_IMPORTS = {
  shared: [],
  config: ['shared'],
  database: ['shared', 'config'],
  ai: ['shared', 'config'],
  voice: ['shared', 'config'],
  core: ['shared', 'config', 'database', 'ai', 'voice'],
};

/** 方向 zones：每个包对每个「非白名单且非自身」包一条目录禁入 zone */
const packageDirectionZones = PACKAGES.flatMap((pkg) =>
  PACKAGES.filter((other) => other !== pkg && !ALLOWED_IMPORTS[pkg].includes(other)).map(
    (denied) => ({
      target: `./packages/${pkg}/**`,
      from: `./packages/${denied}`,
    }),
  ),
);

const directionZones = [
  ...packageDirectionZones,
  // 业务包不得反向依赖可部署应用
  { target: './packages/**', from: './apps' },
  // desktop 壳只允许 shared/config，不碰业务与 DB，也不引用 web 应用
  { target: './apps/desktop/**', from: './packages/database' },
  { target: './apps/desktop/**', from: './packages/ai' },
  { target: './apps/desktop/**', from: './packages/core' },
  { target: './apps/desktop/**', from: './packages/voice' },
  { target: './apps/desktop/**', from: './apps/web' },
  // web 应用不引用桌面壳
  { target: './apps/web/**', from: './apps/desktop' },
];

/**
 * internal 私有目录：发起方（target）引用「其他包」的 internal 目录（from）即违规。
 * 插件的 except 只作用于被导入路径、无法按发起方放行，故直接枚举「发起域 × 其他包」全配对
 * （同包配对不生成 = 同包内访问 internal 天然允许）；测试文件在 overrides 统一放行。
 */
const internalZones = PACKAGES.flatMap((owner) =>
  PACKAGES.filter((importer) => importer !== owner).map((importer) => ({
    target: `./packages/${importer}/**`,
    from: `./packages/${owner}/**/internal/**`,
  })),
);
// 两个可部署应用引用任何包的 internal 均违规
for (const owner of PACKAGES) {
  internalZones.push(
    { target: './apps/web/**', from: `./packages/${owner}/**/internal/**` },
    { target: './apps/desktop/**', from: `./packages/${owner}/**/internal/**` },
  );
}

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  settings: {
    // workspace 包以 TS 源发布（exports 的 development/types 指向 src），
    // 强制经 tsconfig 解析，保证 no-restricted-paths 拿到真实物理路径
    'import/resolver': {
      typescript: {
        project: ['tsconfig.base.json', 'packages/*/tsconfig.json', 'apps/*/tsconfig.json'],
      },
    },
  },
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
    // v1.1 M5：M0 起 warn 观察一个完整版本且零违例，正式翻 error（CI 与 pnpm lint:boundaries 硬门禁）
    'import/no-restricted-paths': ['error', { zones: [...directionZones, ...internalZones] }],
  },
  overrides: [
    {
      // 测试可跨层装配/访问 internal（白体测试需要）；方向门禁由非测试代码保证
      files: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/__tests__/**',
        '**/__mocks__/**',
        'tests/**',
      ],
      rules: { 'import/no-restricted-paths': 'off' },
    },
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
