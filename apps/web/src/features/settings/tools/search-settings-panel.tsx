'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { SearchCredentialsView, SearchSettings } from '@wbfm/shared/types';
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
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';
import { useI18n } from '@/lib/i18n/use-i18n';
import { SearchCredentialField } from './search-credential-field';
import { SearxngDeploySection } from './search-deploy-section';

const FALLBACK: SearchSettings = {
  provider: 'none',
  endpoint: '',
  maxResults: 5,
  timeoutMs: 10_000,
  allowPrivateEndpoint: false,
};

type KeyProvider = 'brave' | 'tavily';

function keyProviderOf(provider: SearchSettings['provider']): KeyProvider | null {
  return provider === 'brave' || provider === 'tavily' ? provider : null;
}

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

  const [apiKey, setApiKey] = React.useState('');
  const keyProvider = keyProviderOf(form.provider);
  const { data: credentials, refetch: refetchCredentials } = useQuery({
    queryKey: QUERY_KEYS.searchCredentials,
    queryFn: () => apiGet<SearchCredentialsView>(API.searchCredential),
  });
  const saveCredential = useMutation({
    mutationFn: (input: { provider: KeyProvider; apiKey: string }) =>
      apiPut<SearchCredentialsView>(API.searchCredential, input),
  });
  const clearCredential = useMutation({
    mutationFn: (provider: KeyProvider) =>
      apiDelete<SearchCredentialsView>(`${API.searchCredential}?provider=${provider}`),
  });

  React.useEffect(() => {
    if (!initialized && settings?.searchSettings) {
      setForm({ ...FALLBACK, ...settings.searchSettings });
      setInitialized(true);
    }
  }, [initialized, settings]);

  // 切换搜索服务时清空未保存的新 Key，避免把 Tavily 的 Key 存到 Brave 名下
  React.useEffect(() => {
    setApiKey('');
  }, [form.provider]);

  const test = useMutation({
    mutationFn: () => apiPost<{ ok: boolean; message: string }>(API.searchTest),
  });

  /** 输入框里有新 Key 时先加密保存，再继续保存设置或测试 */
  const persistKey = async (provider: KeyProvider) => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    await saveCredential.mutateAsync({ provider, apiKey: trimmed });
    setApiKey('');
    await refetchCredentials();
  };

  const save = async () => {
    setSaved(false);
    await update.mutateAsync({
      searchSettings: {
        ...form,
        endpoint: form.provider === 'searxng' ? form.endpoint.trim() : '',
        allowPrivateEndpoint: form.provider === 'searxng' ? form.allowPrivateEndpoint : false,
      },
    });
    if (keyProvider) await persistKey(keyProvider);
    setSaved(true);
  };

  const runTest = async () => {
    setTestState({ kind: 'testing' });
    try {
      if (keyProvider) await persistKey(keyProvider);
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
            <option value="brave">{t('settings.search.providerBrave')}</option>
            <option value="tavily">{t('settings.search.providerTavily')}</option>
          </SimpleSelect>
        </label>

        {form.provider !== 'none' && form.provider !== 'mock' && (
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

      {keyProvider && (
        <SearchCredentialField
          provider={keyProvider}
          status={credentials?.[keyProvider]}
          value={apiKey}
          saving={saveCredential.isPending}
          clearing={clearCredential.isPending}
          onChange={setApiKey}
          onClear={() =>
            clearCredential.mutate(keyProvider, { onSuccess: () => void refetchCredentials() })
          }
        />
      )}

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

          <SearxngDeploySection
            form={form}
            onFormChange={setForm}
            onSettingsSaved={() => setSaved(true)}
            onTestResult={(result) =>
              setTestState({ kind: result.ok ? 'ok' : 'fail', message: result.message })
            }
          />
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
