/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // 工作区 TS 源码包在 Next 编译管线中转译
  transpilePackages: ['@wbfm/shared', '@wbfm/config', '@wbfm/database', '@wbfm/ai', '@wbfm/core'],
  experimental: {
    // Next 14：原生/带二进制资源/自带 worker 的包保持外部 require，
    // 避免 bundler 篡改内部相对路径（pdfjs-dist 的 pdf.worker.mjs 依赖；
    // v0.4：@napi-rs/canvas 的 .node 与 tesseract.js 的 worker/wasm 同理）
    serverComponentsExternalPackages: [
      'better-sqlite3',
      'sqlite-vec',
      'pdfjs-dist',
      '@napi-rs/canvas',
      'tesseract.js',
      // v1.0：sherpa-onnx-node 含 .node 原生绑定与 DLL，必须外部 require
      'sherpa-onnx-node',
    ],
    // 运行时数据根（~/.workbuddy-for-me：语音模型/espeak 数据/附件）绝不能被追踪进
    // standalone：nft 会把模型清单里的字面量路径与 homedir() 静态求值误解析到磁盘上已下载的
    // 用户数据（跨盘符路径无法相对化，被存成「C:/Users/...」嵌套条目），Next 复制时以
    // 「.next/server/C:/Users/...」非法嵌套落盘，单次复制抛错会中断该路由其余文件（含
    // .next/server/chunks 共享 chunk）的归集，打包态 server 启动即 MODULE_NOT_FOUND。
    // 必须用 outputFileTracingIgnores（glob 原样进 picomatch）；outputFileTracingExcludes
    // 会被 path.join(项目根, glob) 拼死，无法表达盘外路径。
    outputFileTracingIgnores: ['**/.workbuddy-for-me/**'],
    // pnpm 虚拟仓下原生二进制/worker/wasm 需显式纳入 standalone 追踪
    outputFileTracingIncludes: {
      '/**/*': [
        './node_modules/sqlite-vec/**/*',
        './node_modules/.pnpm/sqlite-vec@*/node_modules/sqlite-vec/**/*',
        './node_modules/pdfjs-dist/**/*',
        './node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/**/*',
        './node_modules/@napi-rs/canvas/**/*',
        './node_modules/@napi-rs/canvas-win32-x64-msvc/**/*',
        './node_modules/.pnpm/@napi-rs+canvas@*/node_modules/@napi-rs/canvas/**/*',
        './node_modules/.pnpm/@napi-rs+canvas-win32-x64-msvc@*/node_modules/@napi-rs/canvas-win32-x64-msvc/**/*',
        './node_modules/tesseract.js/**/*',
        './node_modules/tesseract.js-core/**/*',
        './node_modules/.pnpm/tesseract.js@*/node_modules/tesseract.js/**/*',
        './node_modules/.pnpm/tesseract.js-core@*/node_modules/tesseract.js-core/**/*',
        // v1.0 sherpa-onnx 原生绑定（JS 包 + win 平台 .node/DLL）
        './node_modules/sherpa-onnx-node/**/*',
        './node_modules/sherpa-onnx-win-x64/**/*',
        './node_modules/.pnpm/sherpa-onnx-node@*/node_modules/sherpa-onnx-node/**/*',
        './node_modules/.pnpm/sherpa-onnx-win-x64@*/node_modules/sherpa-onnx-win-x64/**/*',
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
        // v0.4 OCR：原生 canvas 与 tesseract worker 保持运行时外部 require
        /^@napi-rs\/canvas$/,
        /^tesseract\.js$/,
        // v1.0：sherpa-onnx Node 绑定（含 require(./win-x64) 的平台包解析）
        /^sherpa-onnx-node$/,
      ];
    }
    return config;
  },
};

export default nextConfig;
