import type { McpServerConfig, McpServerInfo, McpServerStatus, McpToolInfo } from '@wbfm/shared';
import { ApiError, isMcpToolName, parseMcpToolName } from '@wbfm/shared';
import type { DatabaseInstance } from '@wbfm/database';
import {
  createMcpServerRepository,
  type McpServerCreateFields,
  type McpServerRepository,
  type McpServerUpdateFields,
} from '@wbfm/database';
import { createMcpClient, type McpClient } from './client';
import { spawnStdioTransport, type StdioTransport } from './stdio-transport';

/** 服务器连接的内存态（配置来自仓储，进程态不落库） */
interface RegistryEntry {
  config: McpServerConfig;
  client: McpClient | null;
  transport: StdioTransport | null;
  tools: McpToolInfo[];
  status: McpServerStatus;
  statusDetail: string | null;
  /** 防并发连接/刷新 */
  refreshing: Promise<void> | null;
}

export interface McpRegistry {
  /** 按仓储现状对齐连接：新增/修改/删除/启停都收敛（异步连接，不阻塞） */
  reconcile(): void;
  /** 新建服务器并触发连接（名称唯一，冲突抛 ApiError.conflict） */
  createServer(fields: McpServerCreateFields): McpServerConfig;
  /** 部分更新并按需重连（改名冲突抛 ApiError.conflict） */
  updateServer(id: string, fields: McpServerUpdateFields): McpServerConfig;
  /** 删除服务器并断开连接；不存在抛 ApiError.notFound */
  removeServer(id: string): void;
  /** 全部服务器视图（配置 + 连接状态 + 工具数），设置页使用 */
  getServerInfos(): McpServerInfo[];
  /** 已连接服务器的全部工具（助手表单/工具运行时使用） */
  getTools(): McpToolInfo[];
  /** 调用指定限定名工具；服务器未连接或工具不存在返回 null 供上层兜底 */
  callTool(
    qualifiedName: string,
    args: unknown,
    timeoutMs: number,
  ): Promise<{ ok: boolean; output: string } | null>;
  /** 优雅断开全部子进程（应用退出/测试收尾） */
  disconnectAll(): Promise<void>;
}

export interface McpRegistryOptions {
  /** 测试注入：替换真实子进程客户端 */
  clientFactory?: (config: McpServerConfig, hooks: {
    onToolsChanged: () => void;
    onClose: (detail: { code: number | null; signal: NodeJS.Signals | null }) => void;
  }) => McpClient;
}

function defaultClientFactory(
  config: McpServerConfig,
  hooks: {
    onToolsChanged: () => void;
    onClose: (detail: { code: number | null; signal: NodeJS.Signals | null }) => void;
  },
): McpClient {
  if (config.transport !== 'stdio') {
    throw new Error('http transport 将在 v0.6 M2 提供，当前仅支持 stdio');
  }
  const transport = spawnStdioTransport({
    command: config.command,
    args: config.args,
    env: config.env,
    onClose: hooks.onClose,
  });
  const client = createMcpClient({ transport, onToolsChanged: hooks.onToolsChanged });
  transport.setMessageHandler((message) => client.handleMessage(message));
  return client;
}

export function createMcpRegistry(
  db: DatabaseInstance,
  options: McpRegistryOptions = {},
): McpRegistry {
  const repo: McpServerRepository = createMcpServerRepository(db);
  const entries = new Map<string, RegistryEntry>();
  const factory = options.clientFactory ?? defaultClientFactory;

  async function refreshTools(entry: RegistryEntry): Promise<void> {
    if (!entry.client) return;
    const tools = await entry.client.listTools(entry.config.name);
    entry.tools = tools;
  }

  async function connect(entry: RegistryEntry): Promise<void> {
    entry.status = 'connecting';
    entry.statusDetail = null;
    try {
      const client = factory(entry.config, {
        onToolsChanged: () => {
          void refreshTools(entry).catch(() => undefined);
        },
        onClose: (detail) => {
          // 进程退出：意外退出标记 error（启停由 reconcile 管理，M1 不自动重启）
          if (entry.status === 'connected' || entry.status === 'connecting') {
            entry.status = 'error';
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
      entry.status = 'error';
      entry.statusDetail = error instanceof Error ? error.message : String(error);
      const client = entry.client;
      entry.client = null;
      entry.transport = null;
      entry.tools = [];
      // 握手失败的进程直接回收，避免僵尸
      void client?.close().catch(() => undefined);
    }
  }

  async function disconnect(entry: RegistryEntry): Promise<void> {
    const client = entry.client;
    entry.client = null;
    entry.transport = null;
    entry.tools = [];
    entry.status = 'disconnected';
    entry.statusDetail = null;
    entry.refreshing = null;
    await client?.close().catch(() => undefined);
  }

  function configSignature(config: McpServerConfig): string {
    return JSON.stringify({
      name: config.name,
      command: config.command,
      args: config.args,
      env: config.env,
      url: config.url,
      headers: config.headers,
    });
  }

  function reconcileAll(): void {
    const servers = repo.list();
    const seen = new Set<string>();

    for (const server of servers) {
      seen.add(server.id);
      if (!server.enabled) {
        const existing = entries.get(server.id);
        if (existing) void disconnect(existing);
        continue;
      }
      const existing = entries.get(server.id);
      if (existing && existing.config.name !== server.name) {
        // 命名空间变更：旧连接立即失效
        void disconnect(existing);
        entries.delete(server.id);
      }
      const entry = entries.get(server.id);
      if (entry && configSignature(entry.config) === configSignature(server)) continue;
      if (entry) {
        // 配置变化：重启进程（同样的连接去重护栏）
        entry.config = server;
        if (!entry.refreshing) {
          entry.refreshing = (async () => {
            await disconnect(entry);
            await connect(entry);
          })().finally(() => {
            entry.refreshing = null;
          });
        }
        continue;
      }
      const fresh: RegistryEntry = {
        config: server,
        client: null,
        transport: null,
        tools: [],
        status: 'disconnected',
        statusDetail: null,
        refreshing: null,
      };
      entries.set(server.id, fresh);
      // 连接去重：进行中不重复发起
      if (!fresh.refreshing) {
        fresh.refreshing = connect(fresh).finally(() => {
          fresh.refreshing = null;
        });
      }
    }

    // 已删除的服务器
    for (const [id, entry] of entries) {
      if (!seen.has(id)) {
        void disconnect(entry);
        entries.delete(id);
      }
    }
  }

  function assertNameFree(name: string, excludeId?: string): void {
    const existing = repo.getByName(name);
    if (existing && existing.id !== excludeId) {
      throw ApiError.conflict(`MCP 服务器名称已存在：${name}`);
    }
  }

  return {
    reconcile: reconcileAll,

    createServer(fields) {
      assertNameFree(fields.name);
      const created = repo.create(fields);
      reconcileAll();
      return created;
    },

    updateServer(id, fields) {
      const current = repo.get(id);
      if (!current) throw ApiError.notFound('MCP 服务器', id);
      if (fields.name !== undefined) assertNameFree(fields.name, id);
      const updated = repo.update(id, fields);
      if (!updated) throw ApiError.notFound('MCP 服务器', id);
      reconcileAll();
      return updated;
    },

    removeServer(id) {
      if (!repo.remove(id)) throw ApiError.notFound('MCP 服务器', id);
      reconcileAll();
    },

    getServerInfos() {
      return repo.list().map((config) => {
        const entry = entries.get(config.id);
        return {
          ...config,
          status: entry?.status ?? 'disconnected',
          statusDetail: entry?.statusDetail ?? null,
          toolCount: entry?.tools.length ?? 0,
        };
      });
    },

    getTools() {
      const all: McpToolInfo[] = [];
      for (const entry of entries.values()) {
        if (entry.status === 'connected') all.push(...entry.tools);
      }
      return all;
    },

    async callTool(qualifiedName, args, timeoutMs) {
      if (!isMcpToolName(qualifiedName)) return null;
      const parsed = parseMcpToolName(qualifiedName);
      if (!parsed) return null;
      const entry = [...entries.values()].find((e) => e.config.name === parsed.serverName);
      if (!entry || entry.status !== 'connected' || !entry.client) return null;
      const tool = entry.tools.find((t) => t.qualifiedName === qualifiedName);
      if (!tool) return null;
      const outcome = await entry.client.callTool(tool.name, args, timeoutMs);
      return { ok: outcome.ok, output: outcome.output };
    },

    async disconnectAll() {
      await Promise.all([...entries.values()].map((entry) => disconnect(entry)));
      entries.clear();
    },
  };
}
