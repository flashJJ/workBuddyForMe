'use client';

import type { KnowledgeBase } from '@wbfm/shared/types';
import { useKnowledgeBases } from '@/lib/hooks/use-knowledge';
import { useI18n } from '@/lib/i18n/use-i18n';
import { NumberInput } from '@/components/ui/number-input';
import {
  Field,
  RefTextarea,
  SimpleSelect,
  num,
  str,
  type NodeConfigFormProps,
} from './form-primitives';
import { useModelOptions } from './use-model-options';

export function LlmForm({ nodeId, config, nodes, patch }: NodeConfigFormProps) {
  const { t } = useI18n();
  const modelOptions = useModelOptions();
  const modelId = str(config.modelId);

  return (
    <div className="flex flex-col gap-3">
      <Field label={t('flowEditor.form.llm.modelLabel')} hint={t('flowEditor.form.llm.modelHint')}>
        <SimpleSelect value={modelId} onValueChange={(v) => patch({ modelId: v })}>
          <option value="">{t('flowEditor.form.llm.modelDefault')}</option>
          {modelOptions.map((m) => (
            <option key={m.modelId} value={m.modelId}>
              {m.label}
            </option>
          ))}
        </SimpleSelect>
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
        <NumberInput
          value={num(config.temperature, 0.7)}
          onValueChange={(v) => patch({ temperature: v })}
          min={0}
          max={2}
          step={0.1}
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
        <SimpleSelect
          value={str(config.knowledgeBaseId)}
          onValueChange={(v) => patch({ knowledgeBaseId: v })}
        >
          <option value="">{t('flowEditor.form.knowledge.kbPlaceholder')}</option>
          {list.map((kb: KnowledgeBase) => (
            <option key={kb.id} value={kb.id}>
              {kb.name}
            </option>
          ))}
        </SimpleSelect>
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
        <NumberInput
          value={num(config.topK, 4)}
          onValueChange={(v) => patch({ topK: v })}
          min={1}
          max={20}
          className="h-8 text-xs"
        />
      </Field>
    </div>
  );
}
