'use client';

import * as React from 'react';
import type { McpServerInfo, McpServerStatus } from '@wbfm/shared';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { useMcpMutations, useMcpServers } from '@/lib/hooks/use-mcp';
import { McpServerFormDialog } from './mcp-server-form-dialog';

const STATUS_LABELS: Record<McpServerStatus, string> = {
  connected: '已连接',
  connecting: '连接中…',
  disconnected: '未连接',
  error: '连接失败',
};

const STATUS_STYLES: Record<McpServerStatus, string> = {
  connected: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  connecting: 'border-amber-300 bg-amber-50 text-amber-700',
  disconnected: 'border-muted bg-muted text-muted-foreground',
  error: 'border-red-300 bg-red-50 text-red-700',
};

function commandSummary(server: McpServerInfo): string {
  const parts = [server.command, ...(server.args ?? [])].filter(Boolean);
  return parts.join(' ');
}

/** 设置页 MCP 服务器管理面板（v0.6 M1：stdio 传输最小闭环） */
export function McpPanel() {
  const { data: servers, isLoading, isError, refetch } = useMcpServers();
  const mutations = useMcpMutations();
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<McpServerInfo | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (server: McpServerInfo) => {
    setEditing(server);
    setDialogOpen(true);
  };

  const toggleEnabled = (server: McpServerInfo) => {
    mutations.update.mutate(
      { id: server.id, body: { transport: 'stdio', enabled: !server.enabled } },
      {
        onSuccess: () => toast.success(server.enabled ? '已停用并断开' : '已启用，正在连接'),
        onError: (error) =>
          toast.error(error instanceof ApiClientError ? error.message : '操作失败'),
      },
    );
  };

  const remove = (server: McpServerInfo) => {
    if (!window.confirm(`删除 MCP 服务器「${server.name}」？其工具将从助手中移除。`)) return;
    mutations.remove.mutate(server.id, {
      onSuccess: () => toast.success('已删除'),
      onError: (error) => toast.error(error instanceof ApiClientError ? error.message : '删除失败'),
    });
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="mcp-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">MCP 服务器</h3>
          <p className="text-xs text-muted-foreground">
            接入本地 MCP（Model Context Protocol）服务器，为助手扩展文件搜索等外部工具。
          </p>
        </div>
        <Button type="button" variant="outline" onClick={openCreate}>
          添加服务器
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {isError && (
        <p className="text-sm text-red-600">
          MCP 服务器加载失败，<button className="underline" onClick={() => void refetch()}>重试</button>
        </p>
      )}
      {servers && servers.length === 0 && (
        <p className="text-sm text-muted-foreground">
          还没有 MCP 服务器。添加后可在助手编辑里勾选其工具。
        </p>
      )}
      {servers && servers.length > 0 && (
        <ul className="space-y-2" data-testid="mcp-server-list">
          {servers.map((server) => (
            <li
              key={server.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
              data-testid="mcp-server-item"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{server.name}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLES[server.status]}`}
                    title={server.statusDetail ?? undefined}
                  >
                    {STATUS_LABELS[server.status]}
                  </span>
                  {server.toolCount > 0 && (
                    <span className="text-xs text-muted-foreground">{server.toolCount} 个工具</span>
                  )}
                </div>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {commandSummary(server) || '—'}
                </p>
                {server.status === 'error' && server.statusDetail && (
                  <p className="text-xs text-red-600">{server.statusDetail}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={server.enabled}
                    onChange={() => toggleEnabled(server)}
                  />
                  启用
                </label>
                <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(server)}>
                  编辑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => remove(server)}
                >
                  删除
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <McpServerFormDialog open={dialogOpen} onOpenChange={setDialogOpen} server={editing} />
    </section>
  );
}
