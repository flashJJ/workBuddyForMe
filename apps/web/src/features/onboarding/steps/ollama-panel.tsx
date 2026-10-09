'use client';

import * as React from 'react';
import type { DiscoveredModel, Provider } from '@wbfm/shared/types';
import { inferModelCapabilities } from '@wbfm/shared/constants';
import { Button } from '@/components/ui/button';
import { errorText } from '@/lib/i18n/resolve-error';
import {
  useModelMutations,
  useProviderMutations,
  useProviders,
  useRemoteModels,
} from '@/lib/hooks/use-providers';
import { useI18n } from '@/lib/i18n/use-i18n';

const OLLAMA_URL = 'http://127.0.0.1:11434';

type DetectState = 'idle' | 'detecting' | 'online' | 'offline';

/**
 * 向导第 2 步 · 本地 Ollama 面板：
 * 检测 = 复用正式链路（创建/复用 Ollama 供应商 → testConnection → 拉远程模型），
 * 未运行时给安装指引；发现的模型可点选快速添加。
 */
export function OllamaPanel({ onReady }: { onReady: () => void }) {
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
      onReady();
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
      {state === 'offline' && (
        <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs" role="alert">
          <p className="font-medium text-foreground">{t('onboarding.provider.offline')}</p>
          <p className="text-muted-foreground">
            {t('onboarding.provider.installLead')}{' '}
            <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="underline">
              {t('onboarding.provider.installLink')}
            </a>
            {t('onboarding.provider.installMid')}
          </p>
          <pre className="overflow-x-auto rounded bg-background p-2 font-mono">
            {t('onboarding.provider.pullCommand')}
          </pre>
          <p className="text-muted-foreground">{t('onboarding.provider.installTail')}</p>
          {errorMsg && <p className="text-destructive">{errorMsg}</p>}
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
