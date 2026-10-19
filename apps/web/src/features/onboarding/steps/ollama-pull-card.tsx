'use client';

import * as React from 'react';
import type { OllamaRecommendedModel } from '@wbfm/shared/constants';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useOllamaPull } from '../use-ollama-pull';

/** 体积展示：MB → GB（一位小数） */
function toGb(sizeMb: number): string {
  return (sizeMb / 1000).toFixed(1);
}

/**
 * v2.4 P0-1（T4）：推荐模型卡——**明示体积与耗时档**，一键拉取（带进度与取消）。
 * 拉取完成回调 `onPulled` 让面板刷新远端模型列表，用户即可一键加入供应商。
 */
export function OllamaPullCard({
  model,
  onPulled,
}: {
  model: OllamaRecommendedModel;
  onPulled: () => void;
}) {
  const { t } = useI18n();
  const { state, start, cancel } = useOllamaPull();
  const pulling = state.status === 'pulling';
  // 每次拉取只回调一次（onPulled 身份变化不应重复触发刷新）
  const notifiedRef = React.useRef(false);

  React.useEffect(() => {
    if (state.status === 'pulling') notifiedRef.current = false;
    if (state.status === 'done' && !notifiedRef.current) {
      notifiedRef.current = true;
      onPulled();
    }
  }, [state.status, onPulled]);

  return (
    <div className="space-y-1.5 rounded border p-2" data-testid={`ob-ollama-pull-${model.modelId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-mono text-xs">{model.modelId}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {t('onboarding.provider.sizeLabel', { gb: toGb(model.sizeMb) })}
          </span>
        </div>
        {pulling ? (
          <Button type="button" size="sm" variant="outline" onClick={cancel}>
            {t('onboarding.provider.pullCancel')}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={() => void start(model.modelId)}
            data-testid={`ob-ollama-pull-btn-${model.modelId}`}
          >
            {state.status === 'done' ? t('onboarding.provider.pulled') : t('onboarding.provider.pull')}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {model.etaTier === 'fast'
          ? t('onboarding.provider.etaFast')
          : t('onboarding.provider.etaMedium')}
      </p>
      {pulling && (
        <div className="space-y-1" data-testid="ob-ollama-pull-progress">
          <div className="h-1.5 w-full overflow-hidden rounded bg-muted" aria-hidden>
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${state.percent ?? 0}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {state.percent === null
              ? t('onboarding.provider.pulling')
              : t('onboarding.provider.pullPercent', { percent: state.percent })}
          </p>
        </div>
      )}
      {state.status === 'error' && (
        <p className="text-xs text-destructive" role="alert" data-testid="ob-ollama-pull-error">
          {t('onboarding.provider.pullFailed', { message: state.message })}
        </p>
      )}
    </div>
  );
}
