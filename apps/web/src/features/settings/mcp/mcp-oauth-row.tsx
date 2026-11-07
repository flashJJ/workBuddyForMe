'use client';

import type { McpOAuthStatus } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  status: McpOAuthStatus | undefined;
  busy: boolean;
  onAuthorize: () => void;
  onClear: () => void;
}

/** v2.24：HTTP MCP 服务器的 OAuth 授权状态与操作 */
export function McpOAuthRow({ status, busy, onAuthorize, onClear }: Props) {
  const { t } = useI18n();
  const authorized =
    status?.authorized === true && (status.expired !== true || status.refreshable === true);
  const expired =
    status?.authorized === true && status.expired === true && status.refreshable !== true;
  const label = authorized
    ? t('settingsMcp.mcp.oauth.authorized')
    : expired
      ? t('settingsMcp.mcp.oauth.expired')
      : t('settingsMcp.mcp.oauth.unauthorized');
  const style = authorized
    ? 'border-success/30 bg-success-background text-success'
    : expired
      ? 'border-warning/30 bg-warning-background text-warning'
      : 'border-muted bg-muted text-muted-foreground';

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="mcp-oauth-row">
      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${style}`}>{label}</span>
      {authorized && status?.accountLabel && (
        <span className="max-w-[220px] truncate text-[11px] text-muted-foreground">
          {status.accountLabel}
        </span>
      )}
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onAuthorize}>
        {authorized || expired
          ? t('settingsMcp.mcp.oauth.reauthorize')
          : t('settingsMcp.mcp.oauth.authorize')}
      </Button>
      {status?.authorized && (
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onClear}>
          {t('settingsMcp.mcp.oauth.clear')}
        </Button>
      )}
    </div>
  );
}
