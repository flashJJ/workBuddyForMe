/**
 * instrumentation 的 edge 编译替身。
 *
 * `instrumentation.ts` 会在 Node 与 Edge 两个 runtime 各编译一次；Edge 分支运行时
 * 直接 return，但 Webpack 仍会顺着动态 import 把整个 server container（数据库、
 * MCP stdio、原生模块）打进 bundle，dev 下报 Can't resolve 'fs' / 'node:child_process'。
 *
 * next.config.mjs 在 nextRuntime === 'edge' 时把 voice-runtime-singleton 替换成本文件，
 * 只保留 prewarmTts 的空实现；Node runtime 仍使用真实单例。
 */
export function getVoiceRuntime(): { prewarmTts(): Promise<void> } {
  return { prewarmTts: async () => undefined };
}
