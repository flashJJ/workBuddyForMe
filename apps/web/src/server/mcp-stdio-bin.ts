#!/usr/bin/env node
/**
 * v0.9 workbuddy-mcp-server：MCP stdio 独立入口（桌面打包 bin / 开发态 tsx 均可运行）。
 *
 * 启动参数：
 *   环境变量 WBFM_MCP_TOKEN=<端点密钥 wfk_…>（推荐，不进进程命令行参数）
 *   环境变量 WBFM_DATA_ROOT=<数据目录>（桌面 server-manager 注入；开发态可用用户默认目录）
 *   可选 CLI：--token=<密钥>
 *
 * 安全模型：启动即鉴权（密钥无效直接退出）；stdio 只服务该端点绑定的流程；
 * stdout 是 JSON-RPC 协议通道，所有诊断只写 stderr。
 */
import { initDatabase } from '@wbfm/database';
import {
  createFlowServingStack,
  createMcpFlowContext,
  createWebCipher,
  PublicEndpointError,
  runMcpStdio,
} from '@wbfm/core';

function readTokenArg(): string | null {
  const fromArg = process.argv.find((arg) => arg.startsWith('--token='));
  if (fromArg) return fromArg.slice('--token='.length).trim() || null;
  const fromEnv = process.env.WBFM_MCP_TOKEN;
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : null;
}

function fail(message: string): never {
  process.stderr.write(`[workbuddy-mcp] ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const token = readTokenArg();
  if (!token) fail('缺少端点密钥：请通过环境变量 WBFM_MCP_TOKEN 或 --token= 提供');

  const db = initDatabase();
  const cipher = createWebCipher();
  const stack = createFlowServingStack(db, cipher);

  let endpoint;
  try {
    endpoint = stack.endpoints.authenticate(`Bearer ${token}`, 'mcp');
  } catch (error) {
    if (error instanceof PublicEndpointError) {
      fail(`鉴权失败：${error.code}（${error.message}）`);
    }
    fail(`鉴权失败：${error instanceof Error ? error.message : String(error)}`);
  }

  const context = createMcpFlowContext({
    endpoint,
    workflows: stack.workflows,
    flowRunner: stack.flowRunner,
  });
  runMcpStdio({ context });
  process.stderr.write(
    `[workbuddy-mcp] 已启动：workflow=${endpoint.workflowId} 超时=${endpoint.syncTimeoutMs}ms\n`,
  );

  // stdin 关闭（MCP 客户端退出）→ 收摊子进程连接后退出
  process.stdin.on('end', () => {
    void stack.dispose().finally(() => process.exit(0));
  });
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.stack ?? error.message : String(error));
});
