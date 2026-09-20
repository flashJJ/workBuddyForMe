/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // 工作区 TS 源码包在 Next 编译管线中转译
  transpilePackages: ['@wbfm/shared', '@wbfm/config', '@wbfm/database', '@wbfm/ai', '@wbfm/core'],
  experimental: {
    // Next 14：原生/带二进制资源的包保持外部 require，避免被 bundler 错误打包
    serverComponentsExternalPackages: ['better-sqlite3', 'sqlite-vec'],
    // pnpm 虚拟仓下 sqlite-vec 的向量扩展二进制需显式纳入 standalone 追踪
    outputFileTracingIncludes: {
      '/**/*': [
        './node_modules/sqlite-vec/**/*',
        './node_modules/.pnpm/sqlite-vec@*/node_modules/sqlite-vec/**/*',
      ],
    },
  },
};

export default nextConfig;
