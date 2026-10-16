import type { McpRegistry } from '@wbfm/core/mcp';

/**
 * 进程退出清理：断开全部 MCP 子进程（幂等 best-effort）。
 * 断开链路在首个 await 前同步发出 kill 信号，signal 处理器内随后 exit 也不会遗漏。
 * 标志挂 globalThis：dev server 模块重载会重置模块级变量，重复注册会触发
 * MaxListenersExceededWarning。
 */
export function registerExitCleanup(registry: McpRegistry): void {
  const holder = globalThis as { __WBFM_MCP_EXIT_CLEANUP__?: boolean };
  if (holder.__WBFM_MCP_EXIT_CLEANUP__) return;
  holder.__WBFM_MCP_EXIT_CLEANUP__ = true;
  const disconnectAll = () => {
    void registry.disconnectAll().catch(() => undefined);
  };
  process.once('exit', disconnectAll);
  // 注册处理器会接管默认信号行为，故 cleanup 后显式退出
  process.once('SIGTERM', () => {
    disconnectAll();
    process.exit(0);
  });
  process.once('SIGINT', () => {
    disconnectAll();
    process.exit(0);
  });
}
