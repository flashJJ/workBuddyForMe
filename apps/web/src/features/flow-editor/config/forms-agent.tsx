'use client';

import * as React from 'react';
import { Monitor, LibraryBig } from 'lucide-react';
import { AGENT_BUDGET_BOUNDS } from '@wbfm/shared/schemas';
import { useKnowledgeBases } from '@/lib/hooks/use-knowledge';
import { useAssistants } from '@/lib/hooks/use-assistants';
import { useI18n } from '@/lib/i18n/use-i18n';
import { cn } from '@/lib/utils';
import {
  Field,
  Input,
  RefTextarea,
  Select,
  str,
  type NodeConfigFormProps,
} from './form-primitives';
import { useModelOptions } from './use-model-options';

/** v1.4 agent 节点配置表单（与 flowAgentConfigSchema 字段对齐） */
export function AgentForm({ nodeId, config, nodes, patch }: NodeConfigFormProps) {
  const { t } = useI18n();
  const kbs = useKnowledgeBases();
  const assistants = useAssistants();
  const modelOptions = useModelOptions();
  const scopes: string[] = Array.isArray(config.toolScopes)
    ? (config.toolScopes.filter((s): s is string => typeof s === 'string'))
    : [];

  const toggleScope = (scope: string) => {
    const next = scopes.includes(scope) ? scopes.filter((s) => s !== scope) : [...scopes, scope];
    patch({ toolScopes: next });
  };

  const budgetField = (
    key: 'maxRounds' | 'maxSteps' | 'maxTotalTokens',
    label: string,
    bound: { min: number; max: number },
  ) => (
    <Field label={label} hint={`${bound.min}–${bound.max}`}>
      <Input
        type="number"
        min={bound.min}
        max={bound.max}
        value={config[key] === undefined ? '' : String(config[key])}
        onChange={(e) =>
          patch({ [key]: e.target.value === '' ? undefined : Number(e.target.value) })
        }
        className="h-8 text-xs"
      />
    </Field>
  );

  const roleSelect = (key: 'plannerModelId' | 'executorModelId' | 'reviewerModelId', label: string) => (
    <Field label={label} hint={t('flowEditor.form.agent.roleModelHint')}>
      <Select value={str(config[key])} onChange={(e) => patch({ [key]: e.target.value || undefined })}>
        <option value="">{t('flowEditor.form.agent.roleModelDefault')}</option>
        {modelOptions.map((m) => (
          <option key={m.modelId} value={m.modelId}>
            {m.label}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <div className="flex flex-col gap-3">
      <Field label={t('flowEditor.form.agent.goalLabel')} hint={t('flowEditor.form.agent.goalHint')}>
        <RefTextarea
          value={str(config.goal)}
          nodes={nodes}
          currentNodeId={nodeId}
          onChange={(goal) => patch({ goal })}
          rows={4}
          placeholder={t('flowEditor.form.agent.goalPlaceholder')}
        />
      </Field>

      <Field label={t('flowEditor.form.agent.assistantLabel')} hint={t('flowEditor.form.agent.assistantHint')}>
        <Select
          value={str(config.assistantId)}
          onChange={(e) => patch({ assistantId: e.target.value || null })}
        >
          <option value="">{t('flowEditor.form.agent.assistantDefault')}</option>
          {(assistants.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t('flowEditor.form.agent.kbLabel')}>
        <Select
          value={str(config.knowledgeBaseId)}
          onChange={(e) => patch({ knowledgeBaseId: e.target.value || null })}
        >
          <option value="">{t('flowEditor.form.agent.kbDefault')}</option>
          {(kbs.data ?? []).map((kb) => (
            <option key={kb.id} value={kb.id}>
              {kb.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t('flowEditor.form.agent.scopesLabel')} hint={t('flowEditor.form.agent.scopesHint')}>
        <div className="flex flex-col gap-1.5">
          <ScopeChip
            active={scopes.includes('knowledge')}
            icon={<LibraryBig className="h-3.5 w-3.5" />}
            label={t('flowEditor.form.agent.scopeKnowledge')}
            onClick={() => toggleScope('knowledge')}
          />
          <ScopeChip
            active={scopes.includes('desktop')}
            icon={<Monitor className="h-3.5 w-3.5" />}
            label={t('flowEditor.form.agent.scopeDesktop')}
            onClick={() => toggleScope('desktop')}
          />
          {scopes.includes('desktop') && (
            <p className="text-[11px] leading-tight text-warning">{t('flowEditor.form.agent.scopeDesktopWarning')}</p>
          )}
        </div>
      </Field>

      <div className="rounded-md border bg-muted/30 p-2.5">
        <p className="mb-2 text-[11px] font-medium text-muted-foreground">
          {t('flowEditor.form.agent.budgetTitle')}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {budgetField('maxRounds', t('flowEditor.form.agent.budgetRounds'), AGENT_BUDGET_BOUNDS.maxRounds)}
          {budgetField('maxSteps', t('flowEditor.form.agent.budgetSteps'), AGENT_BUDGET_BOUNDS.maxSteps)}
          {budgetField('maxTotalTokens', t('flowEditor.form.agent.budgetTokens'), AGENT_BUDGET_BOUNDS.maxTotalTokens)}
        </div>
      </div>

      {roleSelect('plannerModelId', t('flowEditor.form.agent.rolePlanner'))}
      {roleSelect('executorModelId', t('flowEditor.form.agent.roleExecutor'))}
      {roleSelect('reviewerModelId', t('flowEditor.form.agent.roleReviewer'))}
    </div>
  );
}

function ScopeChip({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
        active
          ? 'border-teal-500/60 bg-teal-500/10 text-teal-700 dark:text-teal-300'
          : 'bg-background text-muted-foreground hover:border-primary/50',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
