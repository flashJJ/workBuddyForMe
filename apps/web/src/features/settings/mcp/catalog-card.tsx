'use client';

import type { MessageKey } from '@wbfm/shared/i18n';
import type { McpCatalogTier, McpCatalogEntry } from '@wbfm/shared/constants';
import type { McpOAuthStatus, McpRuntimeStatus } from '@wbfm/shared/types';
import { missingCatalogFields } from '@wbfm/shared/constants';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { missingRequirement, type CatalogInstallResult } from './use-catalog-install';

const TIER_KEYS: Record<McpCatalogTier, MessageKey> = {
  recommended: 'settingsMcp.mcp.catalog.tierRecommended',
  optional: 'settingsMcp.mcp.catalog.tierOptional',
  credential: 'settingsMcp.mcp.catalog.tierCredential',
};

const TIER_STYLES: Record<McpCatalogTier, string> = {
  recommended: 'border-success/30 bg-success-background text-success',
  optional: 'border-border bg-muted text-muted-foreground',
  credential: 'border-warning/30 bg-warning-background text-warning',
};

interface Props {
  entry: McpCatalogEntry;
  selected: boolean;
  values: Record<string, string>;
  result: CatalogInstallResult | undefined;
  runtime: McpRuntimeStatus | null;
  oauthStatus?: McpOAuthStatus;
  existing: boolean;
  disabled: boolean;
  onToggle: (entry: McpCatalogEntry) => void;
  onValueChange: (entryId: string, token: string, value: string) => void;
  onManual: (entry: McpCatalogEntry) => void;
  onAuthorize: (serverId: string) => void;
}

/** 能力目录卡片：勾选、依赖徽标、参数输入、安装结果 */
export function CatalogCard({
  entry,
  selected,
  values,
  result,
  runtime,
  oauthStatus,
  existing,
  disabled,
  onToggle,
  onValueChange,
  onManual,
  onAuthorize,
}: Props) {
  const { t } = useI18n();
  const missing = selected ? missingCatalogFields(entry, values) : [];
  const runtimeIssue = runtime ? missingRequirement(entry, runtime) : null;

  const pickDirectory = (token: string) => {
    void window.wbfm?.dialog?.pickDirectory?.().then((picked) => {
      if (picked) onValueChange(entry.id, token, picked);
    });
  };

  return (
    <li
      data-testid={`mcp-catalog-${entry.id}`}
      className={`rounded-md border p-3 transition-colors ${
        selected ? 'border-primary/50 bg-primary/5' : 'bg-background'
      }`}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={selected}
          disabled={disabled}
          aria-label={t('settingsMcp.mcp.catalog.select', { name: entry.title })}
          onChange={() => onToggle(entry)}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{entry.title}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${TIER_STYLES[entry.tier]}`}>
              {t(TIER_KEYS[entry.tier])}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">{entry.name}</span>
            {existing && (
              <Badge variant="outline" className="text-[11px]">
                {t('settingsMcp.mcp.catalog.installed')}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{entry.description}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            {entry.requires.includes('node') && (
              <span className="rounded border px-1.5 py-0.5">
                Node{entry.nodeMinMajor ? ` ${entry.nodeMinMajor}+` : ''}
              </span>
            )}
            {entry.requires.includes('uv') && (
              <span className="rounded border px-1.5 py-0.5">uv / uvx</span>
            )}
            {entry.requires.includes('chrome') && (
              <span className="rounded border px-1.5 py-0.5">Chrome</span>
            )}
            <span className="rounded border px-1.5 py-0.5">
              {entry.transport === 'http'
                ? t('settingsMcp.mcp.catalog.transportHttp')
                : t('settingsMcp.mcp.catalog.transportStdio')}
            </span>
            {entry.auth === 'oauth' && (
              <span className="rounded border border-primary/30 px-1.5 py-0.5 text-primary">
                OAuth
              </span>
            )}
            <a
              className="underline hover:text-foreground"
              href={entry.docsUrl}
              target="_blank"
              rel="noreferrer"
            >
              {t('settingsMcp.mcp.catalog.docs')}
            </a>
            <span>{entry.license}</span>
          </div>
          {entry.note && <p className="text-[11px] text-muted-foreground">{entry.note}</p>}

          {selected && (entry.fields?.length ?? 0) > 0 && (
            <div className="space-y-2 rounded-md border border-dashed p-2">
              {entry.fields!.map((field) => (
                <label
                  key={field.token}
                  className="flex flex-col gap-1 text-[11px] text-muted-foreground"
                >
                  {field.label}
                  <div className="flex gap-2">
                    <input
                      type={field.kind === 'secret' ? 'password' : 'text'}
                      autoComplete="off"
                      className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                      value={values[field.token] ?? ''}
                      placeholder={field.placeholder}
                      onChange={(event) =>
                        onValueChange(entry.id, field.token, event.target.value)
                      }
                    />
                    {field.kind === 'directory' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => pickDirectory(field.token)}
                      >
                        {t('settingsMcp.mcp.catalog.pickDirectory')}
                      </Button>
                    )}
                  </div>
                </label>
              ))}
              {missing.length > 0 && (
                <p className="text-[11px] text-destructive">
                  {t('settingsMcp.mcp.catalog.missingFields', { fields: missing.join('、') })}
                </p>
              )}
            </div>
          )}

          {runtimeIssue && selected && (
            <p className="text-[11px] text-destructive">{runtimeIssue}</p>
          )}
          {result && result.status !== 'idle' && (
            <div className="space-y-1">
              <p
                className={`text-[11px] ${
                  result.status === 'ok' ||
                  (result.status === 'needs_auth' && oauthStatus?.authorized)
                    ? 'text-success'
                    : result.status === 'failed'
                      ? 'text-destructive'
                      : result.status === 'needs_auth'
                        ? 'text-warning'
                        : 'text-muted-foreground'
                }`}
              >
                {result.status === 'installing' && t('settingsMcp.mcp.catalog.installing')}
                {result.status === 'ok' &&
                  t('settingsMcp.mcp.catalog.installOk', { count: result.toolCount ?? 0 })}
                {result.status === 'skipped' && result.message}
                {result.status === 'failed' && result.message}
                {result.status === 'needs_auth' &&
                  (oauthStatus?.authorized
                    ? t('settingsMcp.mcp.oauth.authorized')
                    : t('settingsMcp.mcp.catalog.needsAuth'))}
              </p>
              {result.status === 'needs_auth' &&
                !oauthStatus?.authorized &&
                result.serverId && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => onAuthorize(result.serverId!)}
                  >
                    {t('settingsMcp.mcp.catalog.authorizeNow')}
                  </Button>
                )}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid={`mcp-preset-${entry.id}`}
          disabled={disabled}
          onClick={() => onManual(entry)}
        >
          {t('settingsMcp.mcp.catalog.manual')}
        </Button>
      </div>
    </li>
  );
}
