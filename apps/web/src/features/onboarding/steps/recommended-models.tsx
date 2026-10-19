'use client';

import * as React from 'react';
import type { ProviderPresetModel } from '@wbfm/shared/constants';
import { errorText } from '@/lib/i18n/resolve-error';
import { useModelMutations } from '@/lib/hooks/use-providers';
import { useI18n } from '@/lib/i18n/use-i18n';

/**
 * v2.4 P0-1（T3）：厂商推荐模型一键添加（供应商创建成功后才渲染）。
 * 能力取自预置定义，避免远端列表为空时还要手填模型 ID。
 */
export function RecommendedModels({
  providerId,
  models,
}: {
  providerId: string;
  models: ProviderPresetModel[];
}) {
  const { t } = useI18n();
  const mutations = useModelMutations();
  const [added, setAdded] = React.useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = React.useState('');

  if (models.length === 0) return null;

  const add = async (model: ProviderPresetModel) => {
    if (added.has(model.modelId)) return;
    setErrorMsg('');
    try {
      await mutations.add.mutateAsync({
        providerId,
        body: { modelId: model.modelId, capabilities: model.capabilities },
      });
      setAdded((prev) => new Set(prev).add(model.modelId));
    } catch (error) {
      setErrorMsg(
        t('onboarding.provider.recommended.addFailed', {
          message: errorText(error, t, { fallback: 'toast.saveFailed' }),
        }),
      );
    }
  };

  return (
    <div className="space-y-1.5" data-testid="ob-cloud-recommended">
      <p className="text-xs font-medium">{t('onboarding.provider.recommended.title')}</p>
      <div className="flex flex-wrap gap-1.5">
        {models.map((model) => (
          <button
            key={model.modelId}
            type="button"
            disabled={added.has(model.modelId)}
            onClick={() => void add(model)}
            data-testid={`ob-model-${model.modelId}`}
            className="rounded border px-2 py-0.5 text-xs hover:bg-accent disabled:opacity-50"
          >
            {added.has(model.modelId) ? '✓ ' : '+ '}
            {model.modelId}
          </button>
        ))}
      </div>
      {errorMsg && (
        <p className="text-xs text-destructive" role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
