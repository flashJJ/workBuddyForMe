'use client';

import * as React from 'react';
import type { McpOAuthStatus, McpServerInfo } from '@wbfm/shared/types';
import type { McpServerStatus } from '@wbfm/shared/constants';
import type { McpCatalogEntry } from '@wbfm/shared/constants';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { errorText } from '@/lib/i18n/resolve-error';
import { useMcpMutations, useMcpOAuthMutations, useMcpOAuthStatuses, useMcpServers, openOAuthUrl } from '@/lib/hooks/capability';
import { useI18n } from '@/lib/i18n/use-i18n';
import { McpCatalog } from './mcp-catalog';
import { McpOAuthRow } from './mcp-oauth-row';
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
  if (server.transport === 'http') return server.url || '—';
  const parts = [server.command, ...(server.args ?? [])].filter(Boolean);
  return parts.join(' ');
}

/** 自带 Authorization（PAT）的服务器不需要也不应展示 OAuth 授权入口 */
function hasStaticAuthHeader(server: McpServerInfo): boolean {
  return Object.keys(server.headers ?? {}).some((key) => key.toLowerCase() === 'authorization');
}

/** 只有已授权或明确因 401 失败的服务器才展示 OAuth 行，避免对普通远程服务器造成误解 */
function needsOAuth(server: McpServerInfo, status: McpOAuthStatus | undefined): boolean {
  if (status?.authorized) return true;
  return server.status === 'error' && /鉴权|401|oauth/i.test(server.statusDetail ?? '');
}

/** 设置页 MCP 服务器管理面板（v0.6 M1：stdio 传输最小闭环） */
export function McpPanel() {
  const { t } = useI18n();
  const { data: servers, isLoading, isError, refetch } = useMcpServers();
  const mutations = useMcpMutations();
  const oauth = useMcpOAuthMutations();
  const { data: oauthStatuses } = useMcpOAuthStatuses();
  const toast = useToast();
  const confirm = useConfirm();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<McpServerInfo | null>(null);
  // v2.3：从预置目录打开表单时携带的预置项（仅新增）
  const [preset, setPreset] = React.useState<McpCatalogEntry | null>(null);
  // 水合门控：查询在途/到达的时机在 SSR 与客户端首帧不一致，直接据此切结构会水合失配
  // （React #418/#422）。首帧恒与 SSR 一致（仅标题栏），挂载后再按数据展开。
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const openCreate = () => {
    setEditing(null);
    setPreset(null);
    setDialogOpen(true);
  };

  const openEdit = (server: McpServerInfo) => {
    setEditing(server);
    setPreset(null);
    setDialogOpen(true);
  };

  const openPreset = (item: McpCatalogEntry) => {
    setEditing(null);
    setPreset(item);
    setDialogOpen(true);
  };

  const toggleEnabled = (server: McpServerInfo) => {
    const body =
      server.transport === 'http'
        ? { transport: 'http' as const, enabled: !server.enabled }
        : { transport: 'stdio' as const, enabled: !server.enabled };
    mutations.update.mutate(
      { id: server.id, body },
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

  /** v2.3：测试连接——后端重连并等待终态，按结果回报成功/未启用/失败 */
  const testConnection = (server: McpServerInfo) => {
    mutations.test.mutate(server.id, {
      onSuccess: (info) => {
        if (info.status === 'connected') {
          toast.success(t('settingsMcp.mcp.testOk', { count: info.toolCount }));
        } else if (info.status === 'disconnected') {
          toast.error(t('settingsMcp.mcp.testDisabled'));
        } else {
          toast.error(
            t('settingsMcp.mcp.testFailed', {
              detail: info.statusDetail ?? t(STATUS_KEYS[info.status]!),
            }),
          );
        }
      },
      onError: (error) =>
        toast.error(errorText(error, t, { fallback: 'settingsMcp.mcp.testFailedShort' })),
    });
  };

  const authorize = async (serverId: string) => {
    // Web 先同步开空白页，避免异步请求后被浏览器拦截；Electron 直接用外链桥打开系统浏览器
    const managed = typeof window !== 'undefined' && Boolean(window.wbfm?.isManaged);
    const popup = !managed && typeof window !== 'undefined' ? window.open('', '_blank') : null;
    try {
      const result = await oauth.start.mutateAsync(serverId);
      if (popup) popup.location.href = result.authorizationUrl;
      else openOAuthUrl(result.authorizationUrl);
      toast.success(t('settingsMcp.mcp.oauth.opened'));
    } catch (error) {
      popup?.close();
      toast.error(errorText(error, t, { fallback: 'settingsMcp.mcp.oauth.startFailed' }));
    }
  };

  const clearOAuth = (serverId: string) => {
    oauth.clear.mutate(serverId, {
      onSuccess: () => toast.success(t('settingsMcp.mcp.oauth.cleared')),
      onError: (error) =>
        toast.error(errorText(error, t, { fallback: 'settingsMcp.mcp.oauth.clearFailed' })),
    });
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

      {/* v2.24：能力中心——推荐 / 可选 / 需凭证三档，勾选后批量安装 */}
      {mounted && (
        <McpCatalog
          servers={servers}
          oauthStatuses={oauthStatuses}
          onManual={openPreset}
          onAuthorize={(id) => void authorize(id)}
        />
      )}

      {mounted && isLoading && <p className="text-sm text-muted-foreground">{t('common.actions.loading')}</p>}
      {mounted && isError && (
        <p className="text-sm text-destructive">
          {t('settingsMcp.mcp.loadFailed')}
          <button className="underline" onClick={() => void refetch()}>
            {t('common.actions.retry')}
          </button>
        </p>
      )}
      {mounted && servers && servers.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('settingsMcp.mcp.empty')}</p>
      )}
      {mounted && servers && servers.length > 0 && (
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
                {server.transport === 'http' &&
                  !hasStaticAuthHeader(server) &&
                  needsOAuth(server, oauthStatuses?.[server.id]) && (
                    <McpOAuthRow
                      status={oauthStatuses?.[server.id]}
                      busy={oauth.start.isPending || oauth.clear.isPending}
                      onAuthorize={() => void authorize(server.id)}
                      onClear={() => clearOAuth(server.id)}
                    />
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid={`mcp-test-${server.id}`}
                  disabled={mutations.test.isPending}
                  onClick={() => testConnection(server)}
                >
                  {t('common.actions.testConnection')}
                </Button>
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

      <McpServerFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        server={editing}
        preset={preset}
      />
    </section>
  );
}
