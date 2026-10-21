'use client';

import * as React from 'react';
import type { DiscoveredModel, Provider } from '@wbfm/shared/types';
import { OLLAMA_RECOMMENDED_MODELS, inferModelCapabilities } from '@wbfm/shared/constants';
import { Button } from '@/components/ui/button';
import { errorText } from '@/lib/i18n/resolve-error';
import {
  useModelMutations,
  useProviderMutations,
  useProviders,
  useRemoteModels,
} from '@/lib/hooks/use-providers';
import { useI18n } from '@/lib/i18n/use-i18n';
import { OllamaInstallGuide } from './ollama-install-guide';
import { OllamaPullCard } from './ollama-pull-card';

const OLLAMA_URL = 'http://127.0.0.1:11434';

type DetectState = 'idle' | 'detecting' | 'online' | 'offline';

/**
 * 向导第 2 步 · 本地 Ollama 面板：
 * - 检测 = 复用正式链路（创建/复用 Ollama 供应商 → testConnection → 拉远程模型）；
 * - 未运行 → 可执行安装指引（T4：winget/下载 + 拉取示例 + 重新检测）；
 * - 运行中 → 推荐模型一键拉取（体积/耗时明示、可取消），拉完可一键把模型加进供应商。
 */
export function OllamaPanel({ onReady }: { onReady: (providerId: string) => void }) {
  const { t } = useI18n();
  const { data: providers } = useProviders();
  const mutations = useProviderMutations();
  const modelMutations = useModelMutations();
  const [state, setState] = React.useState<DetectState>('idle');
  const [provider, setProvider] = React.useState<Provider | null>(null);
  const [remote, setRemote] = React.useState<DiscoveredModel[]>([]);
  const [added, setAdded] = React.useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = React.useState('');

  // useRemoteModels 是 mutation hook，须顶层无条件调用；provider 未定时不会执行
  const remoteMutation = useRemoteModels(provider?.id ?? null);

  /** 一键拉取完成后刷新远端模型列表（失败不阻断，用户可稍后再点检测） */
  const refreshRemote = React.useCallback(async () => {
    if (!provider) return;
    try {
      setRemote(await remoteMutation.mutateAsync());
    } catch {
      /* 刷新失败不阻断 */
    }
  }, [provider, remoteMutation]);

  const detect = async () => {
    setState('detecting');
    setErrorMsg('');
    const existing = providers?.find((item) => item.protocol === 'ollama') ?? null;
    try {
      const target =
        existing ??
        (await mutations.create.mutateAsync({
          name: 'Ollama',
          protocol: 'ollama',
          baseUrl: OLLAMA_URL,
          enabled: true,
        }));
      await mutations.testConnection.mutateAsync(target.id);
      setProvider(target);
      setState('online');
      onReady(target.id);
      try {
        setRemote(await remoteMutation.mutateAsync());
      } catch {
        // 连接已验证，模型发现失败不阻断
        setRemote([]);
      }
    } catch (error) {
      setState('offline');
      setErrorMsg(errorText(error, t, { fallback: 'toast.saveFailed', withDetail: true }));
    }
  };

  const addModel = async (model: DiscoveredModel) => {
    if (!provider || added.has(model.id)) return;
    try {
      await modelMutations.add.mutateAsync({
        providerId: provider.id,
        body: {
          modelId: model.id,
          capabilities: inferModelCapabilities(model.id),
          ...(model.contextLength ? { contextWindow: model.contextLength } : {}),
        },
      });
      setAdded((prev) => new Set(prev).add(model.id));
    } catch (error) {
      setErrorMsg(
        t('onboarding.provider.addFailed', {
          message: errorText(error, t, { fallback: 'toast.saveFailed' }),
        }),
      );
    }
  };

  const busy = state === 'detecting';

  return (
    <div className="space-y-3" data-testid="onboarding-ollama">
      <p className="text-sm text-muted-foreground">{t('onboarding.provider.ollamaLead')}</p>
      <Button type="button" onClick={() => void detect()} disabled={busy} data-testid="ob-ollama-detect">
        {busy ? t('onboarding.provider.detecting') : t('onboarding.provider.detect')}
      </Button>

      {state === 'online' && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400" role="status">
          {t('onboarding.provider.online')}
        </p>
      )}

      {state === 'offline' && <OllamaInstallGuide errorMsg={errorMsg} />}

      {state === 'online' && (
        <div className="space-y-2">
          <p className="text-xs font-medium">{t('onboarding.provider.recommendedTitle')}</p>
          {OLLAMA_RECOMMENDED_MODELS.map((model) => (
            <OllamaPullCard
              key={model.modelId}
              model={model}
              onPulled={() => void refreshRemote()}
            />
          ))}
        </div>
      )}

      {state === 'online' && remote.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">{t('onboarding.provider.modelsTitle')}</p>
          <div className="flex flex-wrap gap-1.5">
            {remote.map((model) => (
              <button
                key={model.id}
                type="button"
                disabled={added.has(model.id)}
                onClick={() => void addModel(model)}
                className="rounded border px-2 py-0.5 text-xs hover:bg-accent disabled:opacity-50"
              >
                {added.has(model.id) ? '✓ ' : '+ '}
                {model.id}
              </button>
            ))}
          </div>
          {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
        </div>
      )}
    </div>
  );
}
