'use client';

import * as React from 'react';
import type { StagePlan } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { SimpleSelect } from '@/components/ui/simple-select';
import { useToast } from '@/components/common/toast';
import { errorText } from '@/lib/i18n/resolve-error';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useAllModels } from '@/lib/hooks/provider';
import { useSkills } from '@/lib/hooks/capability';
import { cn } from '@/lib/utils';
import { StagePlanEditorDialog } from './stage-plan-editor-dialog';
import { useStagePlan } from './use-stage-plan';

export interface ChatStageBarProps {
  conversationId: string;
  streaming: boolean;
  draft: string;
  conversationModelId: string | null;
  assistantModelId: string | null;
  defaultModelId: string | null;
  /** 载入任务文本：只写入输入框，不自动发送 */
  onTaskPrepared: (text: string) => void;
}

/** v2.20 M5：对话顶部阶段条（切换/编辑/载入任务/本会话模型）。 */
export function ChatStageBar({
  conversationId,
  streaming,
  draft,
  conversationModelId,
  assistantModelId,
  defaultModelId,
  onTaskPrepared,
}: ChatStageBarProps) {
  const { t } = useI18n();
  const toast = useToast();
  const { plan, save, prepare } = useStagePlan(conversationId);
  const { data: allModels } = useAllModels();
  const { data: allSkills } = useSkills();
  const [editing, setEditing] = React.useState(false);
  const [editorError, setEditorError] = React.useState<string | null>(null);

  if (!plan) return null;

  const models = (allModels ?? []).filter((model) => model.capabilities.includes('chat'));
  const skills = (allSkills ?? []).filter((skill) => skill.enabled && skill.manifest !== null);
  const activeStep = plan.activeStep === null ? null : plan.steps[plan.activeStep] ?? null;
  const busy = save.isPending || prepare.isPending;
  const effectiveModelId = conversationModelId ?? assistantModelId ?? defaultModelId;
  const effectiveModel = models.find((model) => model.id === effectiveModelId);
  const effectiveLabel = conversationModelId
    ? effectiveModel
      ? `${effectiveModel.displayName}（${effectiveModel.modelId}）`
      : conversationModelId
    : `${t('chat.stagePlan.followAssistant')}${effectiveModel ? ` · ${effectiveModel.displayName}` : ''}`;

  const persist = async (next: StagePlan, successText?: string): Promise<boolean> => {
    try {
      await save.mutateAsync(next);
      if (successText) toast.success(successText);
      return true;
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'chat.stagePlan.saveFailed' }));
      return false;
    }
  };

  const switchStage = (index: number) => {
    if (streaming || busy || index === plan.activeStep) return;
    void persist({ ...plan, activeStep: index });
  };

  const changeModel = (value: string) => {
    if (streaming || busy || plan.activeStep === null) return;
    const next: StagePlan = {
      ...plan,
      steps: plan.steps.map((step, index) =>
        index === plan.activeStep ? { ...step, modelId: value || null } : step,
      ),
    };
    void persist(next, t('chat.stagePlan.modelChanged'));
  };

  const loadTask = async () => {
    if (!activeStep || plan.activeStep === null) {
      toast.info(t('chat.stagePlan.noActive'));
      return;
    }
    if (!activeStep.goal.trim()) {
      toast.info(t('chat.stagePlan.noGoal'));
      return;
    }
    if (draft.trim()) {
      toast.info(t('chat.stagePlan.draftBlocked'));
      return;
    }
    try {
      const result = await prepare.mutateAsync(plan.activeStep);
      onTaskPrepared(result.taskText);
      toast.success(t('chat.stagePlan.prepared'));
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'chat.stagePlan.prepareFailed' }));
    }
  };

  const openEditor = () => {
    if (streaming) {
      toast.info(t('chat.stagePlan.runningBlocked'));
      return;
    }
    setEditorError(null);
    setEditing(true);
  };

  const submitEditor = async (next: StagePlan) => {
    setEditorError(null);
    try {
      await save.mutateAsync(next);
      setEditing(false);
      toast.success(t('chat.stagePlan.saveOk'));
    } catch (error) {
      const message = errorText(error, t, { fallback: 'chat.stagePlan.saveFailed' });
      setEditorError(message);
      toast.error(message);
    }
  };

  const loadDisabled = streaming || busy || !activeStep || !activeStep.goal.trim();

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-1.5 border-b bg-muted/20 px-3 py-1.5"
        data-testid="chat-stage-bar"
        role="group"
        aria-label={t('chat.stagePlan.label')}
      >
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
          {t('chat.stagePlan.label')}
        </span>
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {plan.steps.map((step, index) => (
            <button
              key={index}
              type="button"
              aria-pressed={plan.activeStep === index}
              disabled={streaming || busy}
              onClick={() => switchStage(index)}
              data-testid={`stage-chip-${index}`}
              className={cn(
                'shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors',
                plan.activeStep === index
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground',
              )}
            >
              {index + 1}. {step.title}
            </button>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={streaming || busy}
          onClick={openEditor}
          data-testid="stage-edit"
        >
          {t('chat.stagePlan.edit')}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={loadDisabled}
          title={
            streaming
              ? t('chat.stagePlan.runningBlocked')
              : !activeStep
                ? t('chat.stagePlan.noActive')
                : !activeStep.goal.trim()
                  ? t('chat.stagePlan.noGoal')
                  : undefined
          }
          onClick={() => void loadTask()}
          data-testid="stage-load-task"
        >
          {prepare.isPending ? t('common.actions.loading') : t('chat.stagePlan.loadTask')}
        </Button>
        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          <span className="hidden text-[10px] text-muted-foreground sm:inline">
            {t('chat.stagePlan.effective')}：{effectiveLabel}
          </span>
          <SimpleSelect
            value={activeStep?.modelId ?? ''}
            onValueChange={changeModel}
            disabled={streaming || busy || plan.activeStep === null}
            aria-label={t('chat.stagePlan.model')}
            className="w-44"
            data-testid="stage-model-select"
          >
            <option value="">{t('chat.stagePlan.followAssistant')}</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {t('chat.stagePlan.modelOption', {
                  displayName: model.displayName,
                  modelId: model.modelId,
                })}
              </option>
            ))}
          </SimpleSelect>
          <span className="text-[10px] text-muted-foreground">{t('chat.stagePlan.modelScope')}</span>
        </div>
      </div>

      <StagePlanEditorDialog
        open={editing}
        onOpenChange={setEditing}
        plan={plan}
        models={models}
        skills={skills}
        saving={save.isPending}
        error={editorError}
        onSubmit={(next) => void submitEditor(next)}
      />
    </>
  );
}
