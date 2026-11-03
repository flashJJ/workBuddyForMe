'use client';

import * as React from 'react';
import type { ProviderModel, SkillInfo, StagePlan, StagePlanStep } from '@wbfm/shared/types';
import { STAGE_PLAN_LIMITS } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n/use-i18n';
import { StagePlanEditorStage } from './stage-plan-editor-stage';

const EMPTY_STEP: StagePlanStep = {
  title: '',
  modelId: null,
  skillNames: [],
  goal: '',
  deliverables: '',
};

export interface StagePlanEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: StagePlan;
  models: readonly ProviderModel[];
  skills: readonly SkillInfo[];
  saving: boolean;
  error: string | null;
  onSubmit: (plan: StagePlan) => void;
}

/** v2.20 M5：阶段计划编辑对话框；前端校验后交给服务端再校验。 */
export function StagePlanEditorDialog({
  open,
  onOpenChange,
  plan,
  models,
  skills,
  saving,
  error,
  onSubmit,
}: StagePlanEditorDialogProps) {
  const { t } = useI18n();
  const [draft, setDraft] = React.useState<StagePlan>(plan);

  React.useEffect(() => {
    if (open) setDraft(plan);
  }, [open, plan]);

  const updateStep = (index: number, patch: Partial<StagePlanStep>) => {
    setDraft((prev) => ({
      ...prev,
      steps: prev.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    }));
  };

  const addStep = () => {
    setDraft((prev) =>
      prev.steps.length >= STAGE_PLAN_LIMITS.maxStages
        ? prev
        : { ...prev, steps: [...prev.steps, { ...EMPTY_STEP, skillNames: [] }] },
    );
  };

  const removeStep = (index: number) => {
    setDraft((prev) => {
      if (prev.steps.length <= 1) return prev;
      const steps = prev.steps.filter((_, i) => i !== index);
      const activeStep =
        prev.activeStep === null
          ? null
          : prev.activeStep === index
            ? null
            : prev.activeStep > index
              ? prev.activeStep - 1
              : prev.activeStep;
      return { steps, activeStep };
    });
  };

  const titlesValid = draft.steps.every((step) => step.title.trim().length > 0);
  const canSave =
    !saving &&
    titlesValid &&
    draft.steps.length >= 1 &&
    draft.steps.length <= STAGE_PLAN_LIMITS.maxStages;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" data-testid="stage-plan-editor">
        <DialogHeader>
          <DialogTitle>{t('chat.stagePlan.editorTitle')}</DialogTitle>
          <DialogDescription>{t('chat.stagePlan.editorHint')}</DialogDescription>
        </DialogHeader>

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
          {draft.steps.map((step, index) => (
            <StagePlanEditorStage
              key={index}
              step={step}
              index={index}
              models={models}
              skills={skills}
              canRemove={draft.steps.length > 1}
              onChange={(patch) => updateStep(index, patch)}
              onRemove={() => removeStep(index)}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={draft.steps.length >= STAGE_PLAN_LIMITS.maxStages}
            onClick={addStep}
            data-testid="stage-editor-add"
          >
            + {t('chat.stagePlan.addStage')}
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {draft.steps.length}/{STAGE_PLAN_LIMITS.maxStages}
          </span>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            type="button"
            disabled={!canSave}
            onClick={() => onSubmit(draft)}
            data-testid="stage-editor-save"
          >
            {saving ? t('common.actions.saving') : t('chat.stagePlan.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
