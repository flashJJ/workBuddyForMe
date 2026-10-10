'use client';

import { useQueries } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import type { KnowledgeBase, ProviderModel } from '@wbfm/shared/types';
import { useProviders } from '@/lib/hooks/use-providers';
import { useKnowledgeBases } from '@/lib/hooks/use-knowledge';
import { useI18n } from '@/lib/i18n/use-i18n';
import {
  Field,
  Input,
  RefTextarea,
  Select,
  num,
  str,
  type NodeConfigFormProps,
} from './form-primitives';

/** 跨供应商模型扁平选项（modelId 为全局唯一标识） */
function useModelOptions() {
  const providers = useProviders();
  const ids = (providers.data ?? []).map((p) => p.id);
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['models', id],
      queryFn: () => apiGet<ProviderModel[]>(API.providerModels(id)),
    })),
  });
  return (providers.data ?? []).flatMap((p, i) =>
    (results[i]?.data ?? []).map((m) => ({
      modelId: m.modelId,
      label: `${p.name} / ${m.displayName || m.modelId}`,
    })),
  );
}

export function LlmForm({ nodeId, config, nodes, patch }: NodeConfigFormProps) {
  const { t } = useI18n();
  const modelOptions = useModelOptions();
  const modelId = str(config.modelId);

  return (
    <div className="flex flex-col gap-3">
      <Field label={t('flowEditor.form.llm.modelLabel')} hint={t('flowEditor.form.llm.modelHint')}>
        <Select value={modelId} onChange={(e) => patch({ modelId: e.target.value })}>
          <option value="">{t('flowEditor.form.llm.modelDefault')}</option>
          {modelOptions.map((m) => (
            <option key={m.modelId} value={m.modelId}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('flowEditor.form.llm.systemLabel')}>
        <RefTextarea
          value={str(config.system)}
          nodes={nodes}
          currentNodeId={nodeId}
          onChange={(system) => patch({ system })}
          rows={3}
          placeholder={t('flowEditor.form.llm.systemPlaceholder')}
        />
      </Field>
      <Field label={t('flowEditor.form.llm.userLabel')}>
        <RefTextarea
          value={str(config.user)}
          nodes={nodes}
          currentNodeId={nodeId}
          onChange={(user) => patch({ user })}
          rows={5}
          placeholder={t('flowEditor.form.llm.userPlaceholder')}
        />
      </Field>
      <Field label={t('flowEditor.form.llm.temperatureLabel')}>
        <Input
          type="number"
          min={0}
          max={2}
          step={0.1}
          value={config.temperature === undefined ? '' : num(config.temperature, 0.7)}
          onChange={(e) =>
            patch({ temperature: e.target.value === '' ? undefined : Number(e.target.value) })
          }
          className="h-8 text-xs"
        />
      </Field>
    </div>
  );
}

export function KnowledgeForm({ nodeId, config, nodes, patch }: NodeConfigFormProps) {
  const { t } = useI18n();
  const kbs = useKnowledgeBases();
  const list = kbs.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <Field label={t('flowEditor.form.knowledge.kbLabel')}>
        <Select
          value={str(config.knowledgeBaseId)}
          onChange={(e) => patch({ knowledgeBaseId: e.target.value })}
        >
          <option value="">{t('flowEditor.form.knowledge.kbPlaceholder')}</option>
          {list.map((kb: KnowledgeBase) => (
            <option key={kb.id} value={kb.id}>
              {kb.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('flowEditor.form.knowledge.queryLabel')} hint={t('flowEditor.form.knowledge.queryHint')}>
        <RefTextarea
          value={str(config.query)}
          nodes={nodes}
          currentNodeId={nodeId}
          onChange={(query) => patch({ query })}
          rows={3}
          placeholder={t('flowEditor.form.knowledge.queryPlaceholder')}
        />
      </Field>
      <Field label={t('flowEditor.form.knowledge.topKLabel')}>
        <Input
          type="number"
          min={1}
          max={20}
          value={num(config.topK, 4)}
          onChange={(e) => patch({ topK: Number(e.target.value) || 4 })}
          className="h-8 text-xs"
        />
      </Field>
    </div>
  );
}
