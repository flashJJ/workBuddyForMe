'use client';

import * as React from 'react';
import type { VoiceSettings, VadSensitivity } from '@wbfm/shared/schemas';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/use-i18n';

interface VoiceInputSectionProps {
  settings: VoiceSettings;
  asrReady: boolean;
  onPatch: (patch: Partial<VoiceSettings>) => Promise<void> | void;
}

/** 尾静音预设（ms）：短=反应快但易截断，长=停顿宽容但等得久 */
const SILENCE_PRESETS = [600, 900, 1200, 1500] as const;

/**
 * M4 语音输入方式：PTT 按住说话 / VAD 免手持续聆听。
 * 控件值本地乐观（onChange 即切），effect 回同步服务端值/失败回滚——
 * 与 M2 ToggleRow 同源，规避受控控件二次点击翻转。
 */
export function VoiceInputSection({ settings, asrReady, onPatch }: VoiceInputSectionProps) {
  const { t } = useI18n();
  const [mode, setMode] = React.useState(settings.inputMode);
  const [sensitivity, setSensitivity] = React.useState<VadSensitivity>(settings.vadSensitivity);
  const [silenceMs, setSilenceMs] = React.useState(settings.vadSilenceMs);

  const SENSITIVITY_OPTIONS: Array<{ value: VadSensitivity; label: string; hint: string }> = [
    { value: 'high', label: t('voice.input.sensitivityHigh'), hint: t('voice.input.sensitivityHighHint') },
    { value: 'balanced', label: t('voice.input.sensitivityBalanced'), hint: t('voice.input.sensitivityBalancedHint') },
    { value: 'low', label: t('voice.input.sensitivityLow'), hint: t('voice.input.sensitivityLowHint') },
  ];

  React.useEffect(() => setMode(settings.inputMode), [settings.inputMode]);
  React.useEffect(() => setSensitivity(settings.vadSensitivity), [settings.vadSensitivity]);
  React.useEffect(() => setSilenceMs(settings.vadSilenceMs), [settings.vadSilenceMs]);

  const disabled = !asrReady;
  const isVad = mode === 'vad';

  const selectMode = (next: VoiceSettings['inputMode']) => {
    if (disabled || next === mode) return;
    setMode(next);
    void onPatch({ inputMode: next });
  };

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="voice-input-section">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t('voice.input.title')}</p>
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label={t('voice.input.title')}>
          {(
            [
              { value: 'ptt', label: t('voice.input.modePtt') },
              { value: 'vad', label: t('voice.input.modeVad') },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={mode === opt.value}
              data-testid={`voice-input-mode-${opt.value}`}
              disabled={disabled}
              onClick={() => selectMode(opt.value)}
              className={cn(
                'rounded px-3 py-1.5 text-sm transition-colors',
                mode === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {!asrReady && (
          <p className="text-xs text-warning">{t('voice.input.downloadFirst')}</p>
        )}
      </div>

      {isVad && (
        <div className="space-y-3" data-testid="voice-vad-params">
          <div className="space-y-1.5">
            <Label htmlFor="voice-vad-sensitivity">{t('voice.input.sensitivityLabel')}</Label>
            <Select
              id="voice-vad-sensitivity"
              data-testid="voice-vad-sensitivity"
              value={sensitivity}
              onChange={(e) => {
                const next = e.target.value as VadSensitivity;
                setSensitivity(next);
                void onPatch({ vadSensitivity: next });
              }}
            >
              {SENSITIVITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t('voice.input.sensitivityOption', { label: opt.label, hint: opt.hint })}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="voice-vad-silence">{t('voice.input.silenceLabel')}</Label>
            <Select
              id="voice-vad-silence"
              data-testid="voice-vad-silence"
              value={String(silenceMs)}
              onChange={(e) => {
                const next = Number(e.target.value);
                setSilenceMs(next);
                void onPatch({ vadSilenceMs: next });
              }}
            >
              {SILENCE_PRESETS.map((ms) => (
                <option key={ms} value={ms}>
                  {t('voice.input.silenceSeconds', { seconds: ms / 1000 })}
                  {ms === 600 ? t('voice.input.silenceRecommended') : ''}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('voice.input.halfDuplexHint')}
          </p>
        </div>
      )}
    </div>
  );
}
