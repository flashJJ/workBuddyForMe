'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { McpRuntimeStatus, McpServerInfo } from '@wbfm/shared/types';
import type { McpCatalogEntry } from '@wbfm/shared/constants';
import { apiGet, apiPost } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';
import type { McpServerCreateBody } from '@/lib/hooks/capability';

export interface CatalogInstallResult {
  status: 'idle' | 'installing' | 'ok' | 'failed' | 'skipped' | 'needs_auth';
  message?: string;
  serverId?: string;
  toolCount?: number;
}

type CatalogValues = Record<string, Record<string, string>>;

/** 把 {{token}} 替换为用户填写的值；未填的必填项由调用方先拦截 */
function applyTokens(text: string, values: Record<string, string>): string {
  let next = text;
  for (const [token, value] of Object.entries(values)) {
    next = next.split(token).join(value);
  }
  return next;
}

function applyRecord(
  record: Record<string, string> | undefined,
  values: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(record ?? {})) {
    next[key] = applyTokens(value, values);
  }
  return next;
}

export function buildServerBody(
  entry: McpCatalogEntry,
  values: Record<string, string>,
): McpServerCreateBody {
  if (entry.transport === 'http') {
    return {
      transport: 'http',
      name: entry.name,
      url: applyTokens(entry.url ?? '', values),
      headers: applyRecord(entry.headers, values),
      enabled: true,
    };
  }
  return {
    transport: 'stdio',
    name: entry.name,
    command: entry.command ?? 'npx',
    args: (entry.args ?? []).map((arg) => applyTokens(arg, values)).filter(Boolean),
    env: applyRecord(entry.env, values),
    enabled: true,
  };
}

/** 返回缺失/不满足的依赖说明；满足时返回 null */
export function missingRequirement(
  entry: McpCatalogEntry,
  runtime: McpRuntimeStatus,
): string | null {
  if (entry.requires.includes('node')) {
    if (!runtime.node.available) return '未检测到 Node.js';
    if (!runtime.npx.available) return '未检测到 npx';
    if (entry.nodeMinMajor && (runtime.node.major ?? 0) < entry.nodeMinMajor) {
      return `需要 Node ${entry.nodeMinMajor}+（当前 ${runtime.node.version ?? '未知'}）`;
    }
  }
  if (entry.requires.includes('uv') && !runtime.uvx.available) {
    return '未检测到 uv / uvx';
  }
  if (entry.requires.includes('chrome') && !runtime.chrome.available) {
    return '未检测到本机 Chrome';
  }
  return null;
}

async function waitForServer(id: string, timeoutMs = 90_000): Promise<McpServerInfo | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await apiGet<McpServerInfo[]>(API.mcpServers);
    const server = list.find((item) => item.id === id);
    if (server && (server.status === 'connected' || server.status === 'error')) return server;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * v2.24：能力目录的批量安装状态机。
 * - 安装前先探测运行环境，缺依赖的条目直接失败，不写库；
 * - 创建后轮询服务器状态（npx 首次下载可能超过连接超时）；
 * - 失败不阻断后续条目，结果逐项回传。
 */
export function useCatalogInstall() {
  const qc = useQueryClient();
  const [runtime, setRuntime] = React.useState<McpRuntimeStatus | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [installing, setInstalling] = React.useState(false);
  const [results, setResults] = React.useState<Record<string, CatalogInstallResult>>({});

  const checkRuntime = React.useCallback(async (): Promise<McpRuntimeStatus> => {
    setChecking(true);
    try {
      const status = await apiGet<McpRuntimeStatus>(API.mcpRuntime);
      setRuntime(status);
      return status;
    } finally {
      setChecking(false);
    }
  }, []);

  const install = React.useCallback(
    async (
      entries: McpCatalogEntry[],
      values: CatalogValues,
      existingNames: Set<string>,
    ): Promise<string[]> => {
      if (entries.length === 0) return [];
      setInstalling(true);
      const installed: string[] = [];
      try {
        const status = runtime ?? (await checkRuntime());
        for (const entry of entries) {
          setResults((prev) => ({ ...prev, [entry.id]: { status: 'installing' } }));
          const missing = missingRequirement(entry, status);
          if (missing) {
            setResults((prev) => ({
              ...prev,
              [entry.id]: { status: 'failed', message: missing },
            }));
            continue;
          }
          if (existingNames.has(entry.name)) {
            setResults((prev) => ({
              ...prev,
              [entry.id]: { status: 'skipped', message: '同名服务器已存在' },
            }));
            continue;
          }
          try {
            const created = await apiPost<McpServerInfo>(
              API.mcpServers,
              buildServerBody(entry, values[entry.id] ?? {}),
            );
            const final = await waitForServer(created.id);
            if (!final) {
              setResults((prev) => ({
                ...prev,
                [entry.id]: {
                  status: 'failed',
                  serverId: created.id,
                  message: '已创建，但连接超时；可在下方服务器列表点「测试连接」重试',
                },
              }));
              continue;
            }
            if (final.status === 'connected') {
              installed.push(entry.name);
              setResults((prev) => ({
                ...prev,
                [entry.id]: {
                  status: 'ok',
                  serverId: final.id,
                  toolCount: final.toolCount,
                },
              }));
            } else {
              const detail = final.statusDetail ?? '连接失败';
              const needsAuth = /鉴权|401|oauth/i.test(detail);
              setResults((prev) => ({
                ...prev,
                [entry.id]: {
                  status: needsAuth ? 'needs_auth' : 'failed',
                  serverId: final.id,
                  message: detail,
                },
              }));
            }
          } catch (error) {
            setResults((prev) => ({
              ...prev,
              [entry.id]: { status: 'failed', message: errorMessage(error) },
            }));
          }
        }
      } finally {
        setInstalling(false);
        void qc.invalidateQueries({ queryKey: QUERY_KEYS.mcpServers });
        void qc.invalidateQueries({ queryKey: QUERY_KEYS.mcpTools });
      }
      return installed;
    },
    [checkRuntime, qc, runtime],
  );

  return {
    runtime,
    checking,
    installing,
    results,
    checkRuntime,
    install,
    setResults,
  };
}
