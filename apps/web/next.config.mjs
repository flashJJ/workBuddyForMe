import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// 根 package.json 版本构建期内联到客户端（侧边栏版本号随 sync-version 自动同步，
// 避免再次出现硬编码版本号停留在旧版）
const require = createRequire(import.meta.url);
const appVersion = /** @type {string} */ (require('../../package.json').version);
// Next 15 会向上探测 lockfile；E:\code\traeWork 下还有另一个 package-lock.json，
// 不显式指定会把 tracing root 推到仓库外，standalone 目录层级随之改变。
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
// instrumentation 的 edge 编译替身：避免把 server container/原生依赖打进 Edge bundle
const voiceRuntimeStub = fileURLToPath(
  new URL('./src/lib/server/voice/voice-runtime-singleton.edge-stub.ts', import.meta.url),
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    // v3.0 剧本引擎开关：构建/启动前设置 WBFM_PET_SCRIPT=1 才走 Director 新路径
    NEXT_PUBLIC_WBFM_PET_SCRIPT: process.env.WBFM_PET_SCRIPT ?? '',
  },
  // 工作区 TS 源码包在 Next 编译管线中转译
  transpilePackages: ['@wbfm/shared', '@wbfm/config', '@wbfm/database', '@wbfm/ai', '@wbfm/core', '@wbfm/motion'],
  // 三席 VRM 各 25MB 左右：允许浏览器缓存，二次进入剧场不再重新下载
  async headers() {
    return [
      {
        source: '/vrm/models/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
  experimental: {
    // Windows 页面文件有限时降低构建 worker 并发，避免 spawn UNKNOWN / OOM
    cpus: 2,
    // 本项目路由/共享模块多，dev 期 webpack 缓存会持续膨胀（实测可达数 GB）；
    // 该开关用更保守的缓存策略换取更低内存，仅影响 dev，不影响产物。
    webpackMemoryOptimizations: true,
  },
  // Next 15：服务端原生/带二进制资源/自带 worker 的包保持外部 require，
  // 避免 bundler 篡改内部相对路径（pdfjs-dist 的 pdf.worker.mjs 依赖；
  // v0.4：@napi-rs/canvas 的 .node 与 tesseract.js 的 worker/wasm 同理）。
  // v2.5：原 experimental.serverComponentsExternalPackages 已稳定并改名。
  serverExternalPackages: [
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
  // v2.5：Next 15 已移除 experimental.outputFileTracingIgnores，改用稳定版
  // outputFileTracingExcludes。注意：Windows 下 Next 会把 exclude glob 经 path.join
  // 转成反斜杠，picomatch 不命中盘外路径，因此该键只作非 Windows 兜底；
  // 真正的隔离由 scripts/build.mjs 在构建期重定向 HOME/USERPROFILE，并在构建后
  // 扫描 trace/standalone 做硬门禁（见 v2.5 方案 §6.3）。
  outputFileTracingExcludes: {
    '/*': ['**/.workbuddy-for-me/**'],
  },
  // pnpm 虚拟仓下原生二进制/worker/wasm 需显式纳入 standalone 追踪
  outputFileTracingIncludes: {
    '/*': [
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

  /**
   * pdfjs-dist 的 legacy build 内部用相对路径加载 pdf.worker.mjs，
   * Next bundling 后路径被改写成 .next/server/vendor-chunks/pdf.worker.mjs（不存在），
   * 导致 Route Handler 调用 `pdfjs.getDocument()` 时抛出 fake worker 失败。
   * 解决：把 pdfjs-dist 整包设为 webpack externals，Node 运行时直接 require 原始文件。
   */
  webpack: (config, { isServer, dev, nextRuntime, webpack }) => {
    if (nextRuntime === 'edge') {
      // instrumentation.ts 的 edge 分支运行时直接 return，但 bundler 仍会解析动态 import；
      // 替换成 no-op 单例，避免 Node 原生依赖进入 Edge 编译。
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/voice-runtime-singleton$/, (resource) => {
          resource.request = voiceRuntimeStub;
        }),
      );
    }
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
