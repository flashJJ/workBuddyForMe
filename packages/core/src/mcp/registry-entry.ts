import type { McpServerConfig, McpServerInfo, McpToolInfo } from '@wbfm/shared/types';
import type { McpServerStatus } from '@wbfm/shared/constants';
import type { McpClient } from './client';
import type { StdioTransport } from './stdio-transport';

/** 服务器连接的内存态（配置来自仓储，进程态不落库） */
export interface RegistryEntry {
  config: McpServerConfig;
  client: McpClient | null;
  transport: StdioTransport | null;
  tools: McpToolInfo[];
  status: McpServerStatus;
  statusDetail: string | null;
  /** 防并发连接/刷新 */
  refreshing: Promise<void> | null;
}

/** 新建条目的初始态：未连接、无工具 */
export function createRegistryEntry(config: McpServerConfig): RegistryEntry {
  return {
    config,
    client: null,
    transport: null,
    tools: [],
    status: 'disconnected',
    statusDetail: null,
    refreshing: null,
  };
}

/** 配置指纹：决定 reconcile 是否需要重启连接（忽略启停/时间戳等字段） */
export function configSignature(config: McpServerConfig): string {
  return JSON.stringify({
    name: config.name,
    command: config.command,
    args: config.args,
    env: config.env,
    url: config.url,
    headers: config.headers,
  });
}

/** 进程意外退出后的状态：仅 connected/connecting 转 error，其余状态保持不变（返回 null） */
export function statusAfterProcessExit(status: McpServerStatus): McpServerStatus | null {
  if (status === 'connected' || status === 'connecting') return 'error';
  return null;
}

/** 组装服务器视图：配置 + 实时连接状态 + 工具数（设置页使用） */
export function buildServerInfo(
  config: McpServerConfig,
  entry: RegistryEntry | undefined,
): McpServerInfo {
  return {
    ...config,
    status: entry?.status ?? 'disconnected',
    statusDetail: entry?.statusDetail ?? null,
    toolCount: entry?.tools.length ?? 0,
  };
}

/** 汇总已连接服务器的全部工具（助手表单/工具运行时使用） */
export function collectConnectedTools(entries: Iterable<RegistryEntry>): McpToolInfo[] {
  const all: McpToolInfo[] = [];
  for (const entry of entries) {
    if (entry.status === 'connected') all.push(...entry.tools);
  }
  return all;
}
