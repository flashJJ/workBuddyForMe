'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorText } from '@/lib/i18n/resolve-error';
import { useProviderMutations } from '@/lib/hooks/use-providers';
import type { ProviderCreateBody } from '@/lib/hooks/use-providers';
import { useI18n } from '@/lib/i18n/use-i18n';

type Status =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

/**
 * 向导第 2 步 · 云端 API 面板：名称/Base URL/API Key → 创建并测试。
 * 创建成功即视为供应商已配置（测试失败也保留供应商，可稍后修复）。
 */
export function CloudProviderPanel({ onReady }: { onReady: () => void }) {
  const { t } = useI18n();
  const mutations = useProviderMutations();
  const [name, setName] = React.useState('');
  const [baseUrl, setBaseUrl] = React.useState('');
  const [apiKey, setApiKey] = React.useState('');
  const [status, setStatus] = React.useState<Status>({ kind: 'idle' });

  const submit = async () => {
    if (!name.trim() || !baseUrl.trim()) return;
    setStatus({ kind: 'testing' });
    const body: ProviderCreateBody = {
      name: name.trim(),
      protocol: 'openai-compatible',
      baseUrl: baseUrl.trim(),
      enabled: true,
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    };
    try {
      const provider = await mutations.create.mutateAsync(body);
      onReady();
      try {
        await mutations.testConnection.mutateAsync(provider.id);
        setStatus({ kind: 'ready' });
      } catch (testError) {
        // 供应商已建成：保留并提示，用户可去设置页修正
        setStatus({
          kind: 'error',
          message: errorText(testError, t, { fallback: 'toast.saveFailed', withDetail: true }),
        });
      }
    } catch (error) {
      setStatus({
        kind: 'error',
        message: errorText(error, t, { fallback: 'toast.saveFailed', withDetail: true }),
      });
    }
  };

  return (
    <div className="space-y-3" data-testid="onboarding-cloud">
      <div className="space-y-1">
        <Label htmlFor="ob-cloud-name">{t('onboarding.provider.nameLabel')}</Label>
        <Input
          id="ob-cloud-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('onboarding.provider.namePlaceholderCloud')}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ob-cloud-url">{t('onboarding.provider.baseUrlLabel')}</Label>
        <Input
          id="ob-cloud-url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={t('onboarding.provider.baseUrlPlaceholderCloud')}
          dir="ltr"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ob-cloud-key">
          {t('onboarding.provider.apiKeyLabel')}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            ({t('common.words.optional')})
          </span>
        </Label>
        <Input
          id="ob-cloud-key"
          type="password"
          autoComplete="new-password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={t('onboarding.provider.apiKeyPlaceholder')}
          dir="ltr"
        />
      </div>
      <Button
        type="button"
        onClick={() => void submit()}
        disabled={status.kind === 'testing' || !name.trim() || !baseUrl.trim()}
        data-testid="ob-cloud-submit"
      >
        {status.kind === 'testing'
          ? t('onboarding.provider.testing')
          : t('onboarding.provider.createAndTest')}
      </Button>
      {status.kind === 'ready' && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400" role="status">
          {t('onboarding.provider.ready')}
        </p>
      )}
      {status.kind === 'error' && (
        <p className="text-xs text-destructive" role="alert">
          {t('onboarding.provider.failed', { message: status.message })}
        </p>
      )}
    </div>
  );
}
