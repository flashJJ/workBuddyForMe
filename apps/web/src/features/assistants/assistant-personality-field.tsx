'use client';

import * as React from 'react';
import type { MessageKey } from '@wbfm/shared/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';

/** v1.7 人格四权重字段名（与 Assistant 域字段一一对应） */
export type PersonalityKey =
  | 'personalityFrankness'
  | 'personalityTsundere'
  | 'personalityShy'
  | 'personalityTolerance';

/** M0 冻结预设：坦率=(.8,.2,.2,.6)，傲娇=(.3,.8,.5,.5) */
export const PERSONALITY_PRESETS: ReadonlyArray<{
  id: string;
  labelKey: MessageKey;
  values: Record<PersonalityKey, number>;
}> = [
  {
    id: 'frank',
    labelKey: 'assistants.form.personalityPresetFrank',
    values: {
      personalityFrankness: 0.8,
      personalityTsundere: 0.2,
      personalityShy: 0.2,
      personalityTolerance: 0.6,
    },
  },
  {
    id: 'tsundere',
    labelKey: 'assistants.form.personalityPresetTsundere',
    values: {
      personalityFrankness: 0.3,
      personalityTsundere: 0.8,
      personalityShy: 0.5,
      personalityTolerance: 0.5,
    },
  },
];

const SLIDER_KEYS: ReadonlyArray<{ key: PersonalityKey; labelKey: MessageKey }> = [
  { key: 'personalityFrankness', labelKey: 'assistants.form.personalityFrankness' },
  { key: 'personalityTsundere', labelKey: 'assistants.form.personalityTsundere' },
  { key: 'personalityShy', labelKey: 'assistants.form.personalityShy' },
  { key: 'personalityTolerance', labelKey: 'assistants.form.personalityTolerance' },
];

interface AssistantPersonalityFieldProps {
  values: Record<PersonalityKey, number>;
  onChange: (patch: Partial<Record<PersonalityKey, number>>) => void;
}

/**
 * v1.7 人格权重：两个一键预设 + 四条 0..1 滑块（步进 0.1）。
 * 权重驱动剧情剧本 branch 支线，不影响普通对话提示词（本版仅事件引擎消费）。
 */
export function AssistantPersonalityField({ values, onChange }: AssistantPersonalityFieldProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-2 rounded-md border p-2.5" data-testid="assistant-personality">
      <div className="space-y-0.5">
        <Label text={t('assistants.form.personalityLabel')} />
        <p className="text-[11px] text-muted-foreground">
          {t('assistants.form.personalityHint')}
        </p>
      </div>

      <div className="flex gap-1.5">
        {PERSONALITY_PRESETS.map((preset) => {
          const active = SLIDER_KEYS.every(
            (item) => values[item.key] === preset.values[item.key],
          );
          return (
            <button
              key={preset.id}
              type="button"
              data-testid={`personality-preset-${preset.id}`}
              aria-pressed={active}
              onClick={() => onChange(preset.values)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {t(preset.labelKey)}
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5">
        {SLIDER_KEYS.map((item) => (
          <label key={item.key} className="flex items-center gap-2 text-xs">
            <span className="w-12 shrink-0 text-muted-foreground">{t(item.labelKey)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={values[item.key]}
              aria-label={t(item.labelKey)}
              data-testid={`personality-slider-${item.key}`}
              onChange={(event) => onChange({ [item.key]: Number(event.target.value) })}
              className="h-1.5 flex-1"
            />
            <span className="w-8 shrink-0 text-right tabular-nums">
              {values[item.key].toFixed(1)}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Label({ text }: { text: string }) {
  return <div className="text-sm font-medium">{text}</div>;
}
