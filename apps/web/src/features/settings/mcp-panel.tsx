'use client';

import * as React from 'react';
import type { McpServerInfo } from '@wbfm/shared/types';
import type { McpServerStatus } from '@wbfm/shared/constants';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { errorText } from '@/lib/i18n/resolve-error';
import { useMcpMutations, useMcpServers } from '@/lib/hooks/use-mcp';
import { useI18n } from '@/lib/i18n/use-i18n';
import { McpServerFormDialog } from './mcp-server-form-dialog';

const STATUS_KEYS: Record<McpServerStatus, MessageKey> = {
  connected: 'settingsMcp.mcp.status.connected',
  connecting: 'settingsMcp.mcp.status.connecting',
  disconnected: 'settingsMcp.mcp.status.disconnected',
  error: 'settingsMcp.mcp.status.error',
};

const STATUS_STYLES: Record<McpServerStatus, string> = {
  connected: 'border-success/30 bg-success-background text-success',
  connecting: 'border-warning/30 bg-warning-background text-warning',
  disconnected: 'border-muted bg-muted text-muted-foreground',
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
};

function commandSummary(server: McpServerInfo): string {
  const parts = [server.command, ...(server.args ?? [])].filter(Boolean);
  return parts.join(' ');
}

/** 设置页 MCP 服务器管理面板（v0.6 M1：stdio 传输最小闭环） */
export function McpPanel() {
  const { t } = useI18n();
  const { data: servers, isLoading, isError, refetch } = useMcpServers();
  const mutations = useMcpMutations();
  const toast = useToast();
  const confirm = useConfirm();
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
        onSuccess: () =>
          toast.success(
            server.enabled
              ? t('settingsMcp.mcp.disabledDisconnected')
              : t('settingsMcp.mcp.enabledConnecting'),
          ),
        onError: (error) => toast.error(errorText(error, t, { fallback: 'toast.operationFailed' })),
      },
    );
  };

  const remove = async (server: McpServerInfo) => {
    if (
      !(await confirm({
        title: t('settingsMcp.mcp.deleteTitle'),
        description: t('settingsMcp.mcp.deleteConfirm', { name: server.name }),
        confirmText: t('common.actions.delete'),
        danger: true,
      }))
    ) {
      return;
    }
    mutations.remove.mutate(server.id, {
      onSuccess: () => toast.success(t('settingsMcp.mcp.deleted')),
      onError: (error) =>
        toast.error(errorText(error, t, { fallback: 'settingsMcp.deleteFailed' })),
    });
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="mcp-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{t('settingsMcp.mcp.title')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('settingsMcp.mcp.description')}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={openCreate}>
          {t('settingsMcp.mcp.addServer')}
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.actions.loading')}</p>}
      {isError && (
        <p className="text-sm text-destructive">
          {t('settingsMcp.mcp.loadFailed')}
          <button className="underline" onClick={() => void refetch()}>
            {t('common.actions.retry')}
          </button>
        </p>
      )}
      {servers && servers.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('settingsMcp.mcp.empty')}</p>
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
                    {t(STATUS_KEYS[server.status]!)}
                  </span>
                  {server.toolCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {t('settingsMcp.mcp.toolCount', { count: server.toolCount })}
                    </span>
                  )}
                </div>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {commandSummary(server) || '—'}
                </p>
                {server.status === 'error' && server.statusDetail && (
                  <p className="text-xs text-destructive">{server.statusDetail}</p>
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
                  {t('common.actions.enable')}
                </label>
                <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(server)}>
                  {t('common.actions.edit')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => remove(server)}
                >
                  {t('common.actions.delete')}
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
