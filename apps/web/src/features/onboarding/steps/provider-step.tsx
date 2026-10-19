'use client';

import * as React from 'react';
import { useProviders } from '@/lib/hooks/use-providers';
import { useOllamaProbe } from '@/lib/hooks/use-ollama-probe';
import { useI18n } from '@/lib/i18n/use-i18n';
import { CloudProviderPanel } from './cloud-provider-panel';
import { OllamaPanel } from './ollama-panel';
import { DemoProviderPanel } from './demo-provider-panel';
import { LatencyProbe } from './latency-probe';

type Tab = 'demo' | 'cloud' | 'ollama';

const TAB_ORDER: Tab[] = ['demo', 'ollama', 'cloud'];

const TAB_TEST_IDS: Record<Tab, string> = {
  demo: 'ob-tab-demo',
  ollama: 'ob-tab-ollama',
  cloud: 'ob-tab-cloud',
};

/**
 * 向导第 2 步：三选一来源（演示模式 / 本地 Ollama / 云端 API）。
 * v2.4 M1：保留步骤 id `provider`；默认顺序 演示模式 → 本地 → 云端；
 * 进入本步即提前探测本机 Ollama，命中则本地来源置顶并默认选中；
 * 任一来源就绪后跑一次首字延迟自检（T5）并给出结论与「换一个来源」出口。
 */
export function ProviderStep() {
  const { t } = useI18n();
  const { data: providers } = useProviders();
  const { data: probe } = useOllamaProbe();
  const ollamaDetected = probe?.available === true;
  const [tab, setTab] = React.useState<Tab>('demo');
  const [configured, setConfigured] = React.useState(false);
  const [readyProviderId, setReadyProviderId] = React.useState<string | null>(null);
  // 用户手动切过页签后，迟到的探测结果不再抢占焦点
  const touched = React.useRef(false);

  const markReady = React.useCallback((providerId: string) => {
    setConfigured(true);
    setReadyProviderId(providerId);
  }, []);

  // 重放向导时，已有启用供应商直接视为配置完成（并作为延迟自检目标）
  React.useEffect(() => {
    if (readyProviderId) return;
    const enabled = providers?.find((provider) => provider.enabled);
    if (enabled) markReady(enabled.id);
  }, [providers, readyProviderId, markReady]);

  // 提前探测命中：本地置顶且默认选中（未命中则维持演示模式）
  React.useEffect(() => {
    if (ollamaDetected && !touched.current) setTab('ollama');
  }, [ollamaDetected]);

  const select = (id: Tab) => {
    touched.current = true;
    setTab(id);
  };

  const labels: Record<Tab, string> = {
    demo: t('onboarding.provider.tabDemo'),
    ollama: t('onboarding.provider.tabOllama'),
    cloud: t('onboarding.provider.tabCloud'),
  };

  const order = ollamaDetected ? [TAB_ORDER[1]!, TAB_ORDER[0]!, TAB_ORDER[2]!] : TAB_ORDER;

  const tabButton = (id: Tab) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={tab === id}
      data-testid={TAB_TEST_IDS[id]}
      onClick={() => select(id)}
      className={
        tab === id
          ? 'rounded-md border-primary bg-primary/10 px-3 py-1.5 text-sm font-medium'
          : 'rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent'
      }
    >
      {labels[id]}
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
        {order.map(tabButton)}
      </div>

      {tab === 'demo' && <DemoProviderPanel onReady={markReady} />}
      {tab === 'ollama' && <OllamaPanel onReady={markReady} />}
      {tab === 'cloud' && <CloudProviderPanel onReady={markReady} />}

      {readyProviderId && <LatencyProbe providerId={readyProviderId} />}
    </div>
  );
}
