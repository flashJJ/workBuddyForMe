'use client';

import * as React from 'react';
import type { ProviderModel } from '@wbfm/shared/types';
import { ASSISTANT_FALLBACK_MODELS_MAX } from '@wbfm/shared/constants';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/simple-select';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  models: ProviderModel[];
  primaryModelId: string;
  value: string[];
  onChange: (ids: string[]) => void;
}

/**
 * v4.19：助手级备用模型链（顺序即切换顺序）。
 * 只负责展示与排序，校验与去重由表单提交体和服务端共同保证。
 */
export function AssistantFallbackField({ models, primaryModelId, value, onChange }: Props) {
  const { t } = useI18n();
  const atLimit = value.length >= ASSISTANT_FALLBACK_MODELS_MAX;
  const candidates = models.filter(
    (model) => model.id !== primaryModelId && !value.includes(model.id),
  );
  const labelOf = (id: string): string => {
    const model = models.find((item) => item.id === id);
    return model ? `${model.displayName}（${model.modelId}）` : id;
  };
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor="assistant-fallback-add">{t('assistants.form.fallbackLabel')}</Label>
      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('assistants.form.fallbackEmpty')}</p>
      ) : (
        <ol className="space-y-1" data-testid="assistant-fallback-chain">
          {value.map((id, index) => (
            <li
              key={id}
              className="flex items-center gap-2 rounded-md border bg-ui-row px-2.5 py-1.5 text-sm"
            >
              <span className="w-5 shrink-0 text-xs text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{labelOf(id)}</span>
              <button
                type="button"
                className="rounded px-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                aria-label={t('assistants.form.fallbackUp')}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="rounded px-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                aria-label={t('assistants.form.fallbackDown')}
                disabled={index === value.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="rounded px-1 text-xs text-muted-foreground hover:text-destructive"
                aria-label={t('assistants.form.fallbackRemove')}
                onClick={() => onChange(value.filter((item) => item !== id))}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
      <SimpleSelect
        id="assistant-fallback-add"
        value=""
        disabled={atLimit || candidates.length === 0}
        onValueChange={(id) => {
          if (id) onChange([...value, id]);
        }}
      >
        <option value="">
          {atLimit
            ? t('assistants.form.fallbackMax', { max: ASSISTANT_FALLBACK_MODELS_MAX })
            : t('assistants.form.fallbackAdd')}
        </option>
        {candidates.map((model) => (
          <option key={model.id} value={model.id}>
            {t('assistants.form.modelOption', {
              displayName: model.displayName,
              modelId: model.modelId,
            })}
          </option>
        ))}
      </SimpleSelect>
      <p className="text-[11px] text-muted-foreground">{t('assistants.form.fallbackHint')}</p>
    </div>
  );
}
