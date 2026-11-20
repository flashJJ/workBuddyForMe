import type { McpServerConfig } from '@wbfm/shared/types';
import type { McpClient } from '../client';
import { statusAfterProcessExit, type RegistryEntry } from '../registry-entry';

export interface RegistryClientHooks {
  onToolsChanged: () => void;
  onClose: (detail: { code: number | null; signal: NodeJS.Signals | null }) => void;
}

export type RegistryClientFactory = (
  config: McpServerConfig,
  hooks: RegistryClientHooks,
) => McpClient;

export async function refreshTools(entry: RegistryEntry): Promise<void> {
  if (!entry.client) return;
  const tools = await entry.client.listTools(entry.config.name);
  entry.tools = tools;
}

/**
 * 建立连接（异步）。
 * 连接代际：旧进程 close 可能晚于新连接建立（stop 超时强杀后立即返回），
 * 迟到的 onClose 不得清掉已接管的新 client，否则新连接被误标 error 且引用丢失。
 */
export async function connectEntry(
  entry: RegistryEntry,
  factory: RegistryClientFactory,
): Promise<void> {
  entry.status = 'connecting';
  entry.statusDetail = null;
  let client: McpClient | null = null;
  try {
    client = factory(entry.config, {
      onToolsChanged: () => {
        if (entry.client !== client) return;
        void refreshTools(entry).catch(() => undefined);
      },
      onClose: (detail) => {
        if (entry.client !== client) return;
        const nextStatus = statusAfterProcessExit(entry.status);
        if (nextStatus) {
          entry.status = nextStatus;
          entry.statusDetail = `进程退出（code=${detail.code ?? 'null'}）`;
        }
        entry.client = null;
        entry.transport = null;
        entry.tools = [];
      },
    });
    entry.client = client;
    await client.initialize();
    entry.tools = await client.listTools(entry.config.name);
    entry.status = 'connected';
    entry.statusDetail = null;
  } catch (error) {
    // 已被新连接接管：只回收自己的进程，不动新连接状态
    if (client !== null && entry.client !== client) {
      void client.close().catch(() => undefined);
      return;
    }
    entry.status = 'error';
    entry.statusDetail = error instanceof Error ? error.message : String(error);
    if (entry.client === client) {
      entry.client = null;
      entry.transport = null;
      entry.tools = [];
    }
    // 握手失败的进程直接回收，避免僵尸
    void client?.close().catch(() => undefined);
  }
}

export async function disconnectEntry(entry: RegistryEntry): Promise<void> {
  const client = entry.client;
  entry.client = null;
  entry.transport = null;
  entry.tools = [];
  entry.status = 'disconnected';
  entry.statusDetail = null;
  entry.refreshing = null;
  await client?.close().catch(() => undefined);
}
