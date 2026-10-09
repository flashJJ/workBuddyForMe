'use client';

import * as React from 'react';
import { useProviders } from '@/lib/hooks/use-providers';
import { useI18n } from '@/lib/i18n/use-i18n';
import { CloudProviderPanel } from './cloud-provider-panel';
import { OllamaPanel } from './ollama-panel';

type Tab = 'cloud' | 'ollama';

/**
 * 向导第 2 步：二选一卡片（云端 API / 本地 Ollama）。
 * 复用正式供应商链路；已存在启用供应商时给提示但仍允许继续添加。
 */
export function ProviderStep() {
  const { t } = useI18n();
  const { data: providers } = useProviders();
  const [tab, setTab] = React.useState<Tab>('cloud');
  const [configured, setConfigured] = React.useState(false);

  // 重放向导时，已有启用供应商直接视为配置完成
  React.useEffect(() => {
    if (providers?.some((p) => p.enabled)) setConfigured(true);
  }, [providers]);

  const tabButton = (id: Tab, label: string, testId: string) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={tab === id}
      data-testid={testId}
      onClick={() => setTab(id)}
      className={
        tab === id
          ? 'rounded-md border-primary bg-primary/10 px-3 py-1.5 text-sm font-medium'
          : 'rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent'
      }
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4" data-testid="onboarding-provider">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('onboarding.provider.heading')}</h2>
        <p className="text-sm text-muted-foreground">{t('onboarding.provider.lead')}</p>
      </div>

      {configured && (
        <p
          className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300"
          data-testid="ob-provider-configured"
        >
          ✓ {t('onboarding.provider.configuredBadge')}
        </p>
      )}

      <div className="flex gap-2" role="tablist" aria-label={t('onboarding.provider.heading')}>
        {tabButton('cloud', t('onboarding.provider.tabCloud'), 'ob-tab-cloud')}
        {tabButton('ollama', t('onboarding.provider.tabOllama'), 'ob-tab-ollama')}
      </div>

      {tab === 'cloud' ? (
        <CloudProviderPanel onReady={() => setConfigured(true)} />
      ) : (
        <OllamaPanel onReady={() => setConfigured(true)} />
      )}
    </div>
  );
}
