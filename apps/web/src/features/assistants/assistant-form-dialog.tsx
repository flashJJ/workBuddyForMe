'use client';

import * as React from 'react';
import type { Assistant } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/common/toast';
import { errorText } from '@/lib/i18n/resolve-error';
import { useAllModels } from '@/lib/hooks/use-settings';
import { useKnowledgeBases } from '@/lib/hooks/use-knowledge';
import { useAssistantMutations } from '@/lib/hooks/use-assistants';
import { useMcpTools } from '@/lib/hooks/use-mcp';
import { useI18n } from '@/lib/i18n/use-i18n';
import { AssistantToolsField } from './assistant-tools-field';
import { AssistantMemoryField } from './assistant-memory-field';
import { AssistantExpressionField } from './assistant-expression-field';
import { buildAssistantBody, type AssistantFormShape } from './assistant-form-body';
import { toForm } from './assistant-form-state';
import { AssistantIdentityFields } from './assistant-identity-fields';
import { NumberField } from './number-field';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assistant?: Assistant | null;
}

type FormState = AssistantFormShape;

export function AssistantFormDialog({ open, onOpenChange, assistant }: Props) {
  const { t } = useI18n();
  const isEdit = Boolean(assistant);
  const mutations = useAssistantMutations();
  const { data: models } = useAllModels();
  const { data: knowledgeBases } = useKnowledgeBases();
  const { data: mcpTools } = useMcpTools();
  const toast = useToast();
  const [form, setForm] = React.useState<FormState>(() => toForm(assistant));
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) setForm(toForm(assistant));
  }, [open, assistant]);

  const update = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));
  const chatModels = (models ?? []).filter((model) => model.capabilities.includes('chat'));

  const toggleTool = (tool: string) => {
    setForm((prev) => {
      const has = prev.enabledTools.includes(tool);
      return {
        ...prev,
        enabledTools: has
          ? prev.enabledTools.filter((t) => t !== tool)
          : [...prev.enabledTools, tool],
      };
    });
  };

  const changeKnowledgeBase = (knowledgeBaseId: string) => {
    setForm((prev) => ({
      ...prev,
      knowledgeBaseId,
      // 取消关联知识库时，连带移除知识库检索工具
      enabledTools: knowledgeBaseId
        ? prev.enabledTools
        : prev.enabledTools.filter((t) => t !== 'knowledge_search'),
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      if (isEdit && assistant) {
        await mutations.update.mutateAsync({ id: assistant.id, body: buildAssistantBody(form) });
        toast.success(t('assistants.form.updated'));
      } else {
        await mutations.create.mutateAsync(buildAssistantBody(form));
        toast.success(t('assistants.form.created'));
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'toast.saveFailed' }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('assistants.form.editTitle') : t('assistants.form.createTitle')}</DialogTitle>
          <DialogDescription>{t('assistants.form.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <AssistantIdentityFields
            emoji={form.emoji}
            name={form.name}
            color={form.color}
            onUpdate={update}
          />

          <div className="space-y-1.5">
            <Label htmlFor="assistant-prompt">{t('assistants.form.promptLabel')}</Label>
            <Textarea
              id="assistant-prompt"
              value={form.systemPrompt}
              onChange={(e) => update({ systemPrompt: e.target.value })}
              rows={5}
              maxLength={8000}
              placeholder={t('assistants.form.promptPlaceholder')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumberField
              id="assistant-temperature"
              label={t('assistants.form.temperatureLabel')}
              value={form.temperature}
              step="0.1"
              min="0"
              max="2"
              onChange={(value) => update({ temperature: value })}
            />
            <NumberField
              id="assistant-topp"
              label={t('assistants.form.topPLabel')}
              value={form.topP}
              step="0.05"
              min="0"
              max="1"
              onChange={(value) => update({ topP: value })}
            />
            <NumberField
              id="assistant-maxtokens"
              label={t('assistants.form.maxTokensLabel')}
              value={form.maxTokens}
              step="100"
              min="1"
              onChange={(value) => update({ maxTokens: value })}
            />
            <div className="space-y-1.5">
              <Label htmlFor="assistant-model">{t('assistants.form.modelLabel')}</Label>
              <Select
                id="assistant-model"
                value={form.modelId}
                onChange={(e) => update({ modelId: e.target.value })}
              >
                <option value="">{t('assistants.form.modelFollowDefault')}</option>
                {chatModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {t('assistants.form.modelOption', {
                      displayName: model.displayName,
                      modelId: model.modelId,
                    })}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assistant-kb">{t('assistants.form.kbLabel')}</Label>
            <Select
              id="assistant-kb"
              value={form.knowledgeBaseId}
              onChange={(e) => changeKnowledgeBase(e.target.value)}
            >
              <option value="">{t('assistants.form.kbNone')}</option>
              {knowledgeBases?.map((kb) => (
                <option key={kb.id} value={kb.id}>
                  {kb.name}
                </option>
              ))}
            </Select>
          </div>

          <AssistantToolsField
            enabledTools={form.enabledTools}
            knowledgeBaseId={form.knowledgeBaseId}
            retrieveAlways={form.retrieveAlways}
            mcpTools={mcpTools ?? []}
            onToggleTool={toggleTool}
            onRetrieveAlwaysChange={(value) => update({ retrieveAlways: value })}
          />

          <AssistantMemoryField
            checked={form.memoryEnabled}
            onChange={(value) => update({ memoryEnabled: value })}
          />

          <AssistantExpressionField
            checked={form.expressionEnabled}
            onChange={(value) => update({ expressionEnabled: value })}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.actions.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t('assistants.form.saving') : t('common.actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

