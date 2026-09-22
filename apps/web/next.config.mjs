/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // 工作区 TS 源码包在 Next 编译管线中转译
  transpilePackages: ['@wbfm/shared', '@wbfm/config', '@wbfm/database', '@wbfm/ai', '@wbfm/core'],
  experimental: {
    // Next 14：原生/带二进制资源/自带 worker 的包保持外部 require，
    // 避免 bundler 篡改内部相对路径（pdfjs-dist 的 pdf.worker.mjs 依赖）
    serverComponentsExternalPackages: ['better-sqlite3', 'sqlite-vec', 'pdfjs-dist'],
    // pnpm 虚拟仓下 sqlite-vec 的向量扩展二进制与 pdfjs-dist worker 需显式纳入 standalone 追踪
    outputFileTracingIncludes: {
      '/**/*': [
        './node_modules/sqlite-vec/**/*',
        './node_modules/.pnpm/sqlite-vec@*/node_modules/sqlite-vec/**/*',
        './node_modules/pdfjs-dist/**/*',
        './node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/**/*',
      ],
    },
  },

  /**
   * pdfjs-dist 的 legacy build 内部用相对路径加载 pdf.worker.mjs，
   * Next bundling 后路径被改写成 .next/server/vendor-chunks/pdf.worker.mjs（不存在），
   * 导致 Route Handler 调用 `pdfjs.getDocument()` 时抛出 fake worker 失败。
   * 解决：把 pdfjs-dist 整包设为 webpack externals，Node 运行时直接 require 原始文件。
   */
  webpack: (config, { isServer, dev }) => {
    if (isServer) {
      config.externals = config.externals || [];
      const existing = Array.isArray(config.externals)
        ? config.externals
        : [config.externals];
      config.externals = [
        ...existing,
        /^pdfjs-dist(\/.*)?$/,
      ];
    }
    return config;
  },
};

export default nextConfig;
