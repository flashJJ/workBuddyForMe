'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import type { SearchSettings } from '@wbfm/shared/types';
import type { SearxngDeployResult } from '@wbfm/shared/search';
import {
  SEARCH_MAX_RESULTS_MAX,
  SEARCH_MAX_RESULTS_MIN,
  SEARCH_PUBLIC_INSTANCES,
} from '@wbfm/shared/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { SimpleSelect } from '@/components/ui/simple-select';
import { Spinner } from '@/components/common/state';
import { useSettings, useUpdateSettings } from '@/lib/hooks/provider';
import { apiPost } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import { useI18n } from '@/lib/i18n/use-i18n';

const FALLBACK: SearchSettings = {
  provider: 'none',
  endpoint: '',
  maxResults: 5,
  timeoutMs: 10_000,
  allowPrivateEndpoint: false,
};

/** v2.17：联网搜索设置（SearXNG 自建 / 关闭；查询会离开本机） */
export function SearchSettingsPanel() {
  const { t } = useI18n();
  const { data: settings, isLoading } = useSettings();
  const update = useUpdateSettings();
  const [form, setForm] = React.useState<SearchSettings>(FALLBACK);
  const [initialized, setInitialized] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [testState, setTestState] = React.useState<
    { kind: 'idle' } | { kind: 'testing' } | { kind: 'ok'; message: string } | { kind: 'fail'; message: string }
  >({ kind: 'idle' });
  const [deploy, setDeploy] = React.useState<
    | { kind: 'idle' }
    | { kind: 'running' }
    | { kind: 'ok'; endpoint: string }
    | { kind: 'fail'; result: Extract<SearxngDeployResult, { ok: false }> }
  >({ kind: 'idle' });

  React.useEffect(() => {
    if (!initialized && settings?.searchSettings) {
      setForm({ ...FALLBACK, ...settings.searchSettings });
      setInitialized(true);
    }
  }, [initialized, settings]);

  const test = useMutation({
    mutationFn: () => apiPost<{ ok: boolean; message: string }>(API.searchTest),
  });

  const save = async () => {
    setSaved(false);
    await update.mutateAsync({
      searchSettings: {
        ...form,
        endpoint: form.provider === 'searxng' ? form.endpoint.trim() : '',
        allowPrivateEndpoint: form.provider === 'searxng' ? form.allowPrivateEndpoint : false,
      },
    });
    setSaved(true);
  };

  const runTest = async () => {
    setTestState({ kind: 'testing' });
    try {
      const result = await test.mutateAsync();
      setTestState({
        kind: result.ok ? 'ok' : 'fail',
        message: result.message,
      });
    } catch (error) {
      setTestState({
        kind: 'fail',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (isLoading) return <Spinner />;

  // 桌面端才有本机部署桥；Web 模式退回「手动填写 / 公共实例」
  const deployBridge = typeof window !== 'undefined' ? window.wbfm?.search : undefined;

  /**
   * 一键部署：拉起本机容器 → 回填地址并勾选允许内网 → 保存 → 立即测试。
   * 部署本身由主进程完成（Docker 检测、配置写入、端口选择、健康等待）。
   */
  const runDeploy = async () => {
    if (!deployBridge) return;
    setDeploy({ kind: 'running' });
    try {
      const result = await deployBridge.deploySearxng();
      if (!result.ok) {
        setDeploy({ kind: 'fail', result });
        return;
      }
      const next: SearchSettings = {
        ...form,
        provider: 'searxng',
        endpoint: result.endpoint,
        allowPrivateEndpoint: true,
      };
      setForm(next);
      await update.mutateAsync({ searchSettings: next });
      setSaved(true);
      setDeploy({ kind: 'ok', endpoint: result.endpoint });
      const tested = await test.mutateAsync();
      setTestState({ kind: tested.ok ? 'ok' : 'fail', message: tested.message });
    } catch (error) {
      setDeploy({
        kind: 'fail',
        result: {
          ok: false,
          reason: 'start_failed',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  };

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" data-testid="search-settings-panel">
      <div>
        <h2 className="font-medium">{t('settings.search.title')}</h2>
        <p className="text-xs text-muted-foreground">{t('settings.search.description')}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t('settings.search.provider')}
          <SimpleSelect
            value={form.provider}
            onValueChange={(value) =>
              setForm((prev) => ({ ...prev, provider: value as SearchSettings['provider'] }))
            }
          >
            <option value="none">{t('settings.search.providerNone')}</option>
            <option value="searxng">{t('settings.search.providerSearxng')}</option>
          </SimpleSelect>
        </label>

        {form.provider === 'searxng' && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('settings.search.maxResults')}
            <NumberInput
              value={form.maxResults}
              min={SEARCH_MAX_RESULTS_MIN}
              max={SEARCH_MAX_RESULTS_MAX}
              step={1}
              onValueChange={(value) => setForm((prev) => ({ ...prev, maxResults: value }))}
            />
          </label>
        )}
      </div>

      {form.provider === 'searxng' && (
        <>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('settings.search.publicPreset')}
            <SimpleSelect
              value={
                SEARCH_PUBLIC_INSTANCES.some((item) => item.endpoint === form.endpoint)
                  ? form.endpoint
                  : ''
              }
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  endpoint: value,
                  // 公共实例是 https 公网地址，不需要内网放行
                  allowPrivateEndpoint: value ? false : prev.allowPrivateEndpoint,
                }))
              }
            >
              <option value="">{t('settings.search.publicPresetCustom')}</option>
              {SEARCH_PUBLIC_INSTANCES.map((item) => (
                <option key={item.endpoint} value={item.endpoint}>
                  {item.label}
                </option>
              ))}
            </SimpleSelect>
            <span className="text-[11px] text-muted-foreground">
              {t('settings.search.publicPresetHint')}
            </span>
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('settings.search.endpoint')}
            <Input
              value={form.endpoint}
              onChange={(event) => setForm((prev) => ({ ...prev, endpoint: event.target.value }))}
              placeholder={t('settings.search.endpointPlaceholder')}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={form.allowPrivateEndpoint}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, allowPrivateEndpoint: event.target.checked }))
              }
            />
            {t('settings.search.allowPrivate')}
          </label>

          {deployBridge && (
            <div className="space-y-2 rounded-md border border-dashed p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm">{t('settings.search.deployTitle')}</p>
                  <p className="text-xs text-muted-foreground">{t('settings.search.deployHint')}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void runDeploy()}
                  disabled={deploy.kind === 'running' || update.isPending}
                >
                  {deploy.kind === 'running'
                    ? t('settings.search.deploying')
                    : t('settings.search.deploy')}
                </Button>
              </div>
              {deploy.kind === 'ok' && (
                <p className="text-sm text-success" role="status">
                  {t('settings.search.deployOk', { endpoint: deploy.endpoint })}
                </p>
              )}
              {deploy.kind === 'fail' && (
                <div className="space-y-1">
                  <p className="text-sm text-destructive" role="status">
                    {deploy.result.message}
                  </p>
                  {deploy.result.manualCommand && (
                    <pre className="overflow-x-auto rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                      {deploy.result.manualCommand}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        {t('settings.search.privacy')}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => void save()} disabled={update.isPending}>
          {update.isPending ? t('settings.search.saving') : t('settings.search.save')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void runTest()}
          disabled={test.isPending || form.provider === 'none'}
        >
          {test.isPending ? t('settings.search.testing') : t('settings.search.test')}
        </Button>
        {saved && <span className="text-sm text-success">{t('settings.search.saved')}</span>}
      </div>

      {testState.kind === 'ok' && (
        <p className="text-sm text-success" role="status">
          {testState.message}
        </p>
      )}
      {testState.kind === 'fail' && (
        <p className="text-sm text-destructive" role="status">
          {t('settings.search.testFail', { message: testState.message })}
        </p>
      )}
    </section>
  );
}
