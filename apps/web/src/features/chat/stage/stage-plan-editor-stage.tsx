'use client';

import type { ProviderModel, SkillInfo, StagePlanStep } from '@wbfm/shared/types';
import { STAGE_PLAN_LIMITS } from '@wbfm/shared/types';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/simple-select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/use-i18n';

export interface StagePlanEditorStageProps {
  step: StagePlanStep;
  index: number;
  models: readonly ProviderModel[];
  skills: readonly SkillInfo[];
  canRemove: boolean;
  onChange: (patch: Partial<StagePlanStep>) => void;
  onRemove: () => void;
}

/** v2.20 M5：单个阶段编辑卡片（标题/模型/技能/目标/交付）。 */
export function StagePlanEditorStage({
  step,
  index,
  models,
  skills,
  canRemove,
  onChange,
  onRemove,
}: StagePlanEditorStageProps) {
  const { t } = useI18n();
  const chatModels = models.filter((model) => model.capabilities.includes('chat'));
  const titleMissing = !step.title.trim();

  const toggleSkill = (name: string) => {
    if (!step.skillNames.includes(name) && step.skillNames.length >= STAGE_PLAN_LIMITS.maxSkillsPerStage) {
      return;
    }
    onChange({
      skillNames: step.skillNames.includes(name)
        ? step.skillNames.filter((item) => item !== name)
        : [...step.skillNames, name],
    });
  };

  return (
    <section
      className="space-y-2 rounded-md border bg-muted/20 p-2.5"
      data-testid={`stage-editor-row-${index}`}
    >
      <header className="flex items-center gap-2">
        <span className="text-xs font-medium">
          {t('chat.stagePlan.stageIndex', { index: index + 1 })}
        </span>
        <button
          type="button"
          className="ml-auto text-xs text-muted-foreground hover:text-destructive"
          disabled={!canRemove}
          onClick={onRemove}
          data-testid={`stage-editor-remove-${index}`}
        >
          {t('chat.stagePlan.removeStage')}
        </button>
      </header>

      <label className="block space-y-1">
        <span className="text-[11px] text-muted-foreground">{t('chat.stagePlan.stageTitle')}</span>
        <Input
          value={step.title}
          maxLength={STAGE_PLAN_LIMITS.maxTitleLength}
          aria-invalid={titleMissing}
          className={cn(titleMissing && 'border-destructive')}
          onChange={(event) => onChange({ title: event.target.value })}
          data-testid={`stage-editor-title-${index}`}
        />
        {titleMissing && <span className="text-[11px] text-destructive">{t('chat.stagePlan.titleRequired')}</span>}
      </label>

      <label className="block space-y-1">
        <span className="text-[11px] text-muted-foreground">{t('chat.stagePlan.model')}</span>
        <SimpleSelect
          value={step.modelId ?? ''}
          onValueChange={(value) => onChange({ modelId: value || null })}
          aria-label={t('chat.stagePlan.model')}
          data-testid={`stage-editor-model-${index}`}
        >
          <option value="">{t('chat.stagePlan.followAssistant')}</option>
          {chatModels.map((model) => (
            <option key={model.id} value={model.id}>
              {t('chat.stagePlan.modelOption', {
                displayName: model.displayName,
                modelId: model.modelId,
              })}
            </option>
          ))}
        </SimpleSelect>
      </label>

      <div className="space-y-1">
        <span className="text-[11px] text-muted-foreground">{t('chat.stagePlan.skills')}</span>
        {skills.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">{t('chat.stagePlan.skillsEmpty')}</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {skills.map((skill) => {
              const checked = step.skillNames.includes(skill.name);
              return (
                <button
                  key={skill.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggleSkill(skill.name)}
                  data-testid={`stage-editor-skill-${index}-${skill.name}`}
                  className={cn(
                    'rounded-full border px-2 py-0.5 font-mono text-[11px]',
                    checked
                      ? 'border-primary/60 bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:border-primary/40',
                  )}
                >
                  {skill.name}
                </button>
              );
            })}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">{t('chat.stagePlan.skillsHint')}</p>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] text-muted-foreground">{t('chat.stagePlan.goal')}</span>
        <Textarea
          rows={2}
          value={step.goal}
          maxLength={STAGE_PLAN_LIMITS.maxTextLength}
          onChange={(event) => onChange({ goal: event.target.value })}
          data-testid={`stage-editor-goal-${index}`}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-[11px] text-muted-foreground">{t('chat.stagePlan.deliverables')}</span>
        <Textarea
          rows={2}
          value={step.deliverables}
          maxLength={STAGE_PLAN_LIMITS.maxTextLength}
          onChange={(event) => onChange({ deliverables: event.target.value })}
          data-testid={`stage-editor-deliverables-${index}`}
        />
      </label>
    </section>
  );
}
