'use client';

import * as React from 'react';
import type { McpCatalogEntry, McpCatalogTier } from '@wbfm/shared/constants';
import type { McpOAuthStatuses, McpServerInfo } from '@wbfm/shared/types';
import {
  MCP_CATALOG,
  catalogByTier,
  missingCatalogFields,
} from '@wbfm/shared/constants';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { CatalogCard } from './catalog-card';
import { CatalogEnableDialog } from './catalog-enable-dialog';
import { useCatalogInstall } from './use-catalog-install';

const TIER_ORDER: McpCatalogTier[] = ['recommended', 'optional', 'credential'];

interface Props {
  servers: McpServerInfo[] | undefined;
  oauthStatuses?: McpOAuthStatuses;
  onManual: (entry: McpCatalogEntry) => void;
  onAuthorize: (serverId: string) => void;
}

/** v2.24：MCP 能力中心——勾选、环境预检、批量安装、装完启用给助手 */
export function McpCatalog({ servers, oauthStatuses, onManual, onAuthorize }: Props) {
  const { t } = useI18n();
  const { runtime, checking, installing, results, checkRuntime, install } = useCatalogInstall();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [values, setValues] = React.useState<Record<string, Record<string, string>>>({});
  const [installedNames, setInstalledNames] = React.useState<string[]>([]);
  const [enableOpen, setEnableOpen] = React.useState(false);

  // OAuth 服务器授权成功后也视为安装完成，允许一键启用给助手
  React.useEffect(() => {
    if (!oauthStatuses) return;
    const names = Object.entries(results)
      .filter(
        ([, result]) =>
          Boolean(result.serverId) &&
          oauthStatuses[result.serverId!]?.authorized === true,
      )
      .map(([entryId]) => MCP_CATALOG.find((entry) => entry.id === entryId)?.name)
      .filter((name): name is string => Boolean(name));
    if (names.length === 0) return;
    setInstalledNames((prev) => Array.from(new Set([...prev, ...names])));
  }, [oauthStatuses, results]);

  const existingNames = React.useMemo(
    () => new Set((servers ?? []).map((server) => server.name)),
    [servers],
  );
  const selectedEntries = MCP_CATALOG.filter((entry) => selected.includes(entry.id));
  const invalidEntries = selectedEntries.filter(
    (entry) => missingCatalogFields(entry, values[entry.id] ?? {}).length > 0,
  );

  const toggle = (entry: McpCatalogEntry) => {
    setSelected((prev) =>
      prev.includes(entry.id) ? prev.filter((id) => id !== entry.id) : [...prev, entry.id],
    );
  };

  const setValue = (entryId: string, token: string, value: string) => {
    setValues((prev) => ({ ...prev, [entryId]: { ...(prev[entryId] ?? {}), [token]: value } }));
  };

  const selectRecommended = () => {
    setSelected(catalogByTier('recommended').map((entry) => entry.id));
  };

  const runInstall = async () => {
    const names = await install(selectedEntries, values, existingNames);
    setInstalledNames(names);
  };

  const runtimeSummary = runtime
    ? [
        `Node ${runtime.node.version ?? '—'}`,
        `npx ${runtime.npx.version ?? '—'}`,
        `uvx ${runtime.uvx.version ?? '—'}`,
        runtime.chrome.available ? 'Chrome 已安装' : 'Chrome 未检测到',
      ].join(' · ')
    : null;

  return (
    <section className="space-y-3 rounded-lg border p-3" data-testid="mcp-catalog">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-medium">{t('settingsMcp.mcp.catalog.title')}</h4>
          <p className="text-xs text-muted-foreground">
            {t('settingsMcp.mcp.catalog.description')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={selectRecommended}>
            {t('settingsMcp.mcp.catalog.selectRecommended')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setSelected([])}
            disabled={selected.length === 0}
          >
            {t('settingsMcp.mcp.catalog.clear')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void checkRuntime()}
            disabled={checking || installing}
          >
            {checking
              ? t('settingsMcp.mcp.catalog.checking')
              : t('settingsMcp.mcp.catalog.checkRuntime')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void runInstall()}
            disabled={installing || selected.length === 0 || invalidEntries.length > 0}
          >
            {installing
              ? t('settingsMcp.mcp.catalog.installing')
              : t('settingsMcp.mcp.catalog.installSelected', { count: selected.length })}
          </Button>
        </div>
      </div>

      {runtimeSummary && (
        <p className="rounded-md bg-muted px-3 py-2 font-mono text-[11px] text-muted-foreground">
          {runtimeSummary}
        </p>
      )}
      {invalidEntries.length > 0 && (
        <p className="text-xs text-destructive">
          {t('settingsMcp.mcp.catalog.fillRequired', { count: invalidEntries.length })}
        </p>
      )}
      {installedNames.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-success/30 bg-success-background px-3 py-2">
          <span className="text-xs text-success">
            {t('settingsMcp.mcp.catalog.installedCount', { count: installedNames.length })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEnableOpen(true)}
          >
            {t('settingsMcp.mcp.catalog.enableToAssistantsButton')}
          </Button>
        </div>
      )}

      {TIER_ORDER.map((tier) => {
        const entries = catalogByTier(tier);
        if (entries.length === 0) return null;
        return (
          <div key={tier} className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t(
                tier === 'recommended'
                  ? 'settingsMcp.mcp.catalog.tierRecommended'
                  : tier === 'optional'
                    ? 'settingsMcp.mcp.catalog.tierOptional'
                    : 'settingsMcp.mcp.catalog.tierCredential',
              )}
            </p>
            <ul className="grid gap-2 lg:grid-cols-2">
              {entries.map((entry) => {
                const serverId = results[entry.id]?.serverId;
                return (
                  <CatalogCard
                    key={entry.id}
                    entry={entry}
                    selected={selected.includes(entry.id)}
                    values={values[entry.id] ?? {}}
                    result={results[entry.id]}
                    runtime={runtime}
                    oauthStatus={serverId ? oauthStatuses?.[serverId] : undefined}
                    existing={existingNames.has(entry.name)}
                    disabled={installing}
                    onToggle={toggle}
                    onValueChange={setValue}
                    onManual={onManual}
                    onAuthorize={onAuthorize}
                  />
                );
              })}
            </ul>
          </div>
        );
      })}

      {enableOpen && (
        <CatalogEnableDialog
          open
          onOpenChange={setEnableOpen}
          serverNames={installedNames}
        />
      )}
    </section>
  );
}
