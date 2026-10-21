'use client';

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import type { VoiceSettings, VadSensitivity } from '@wbfm/shared/schemas';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/simple-select';
import { useI18n } from '@/lib/i18n/use-i18n';
import { profileOf, profilePatch, type VoiceProfileId } from '../voice-quick-config';

interface VoiceInputSectionProps {
  settings: VoiceSettings;
  asrReady: boolean;
  onPatch: (patch: Partial<VoiceSettings>) => Promise<void> | void;
}

/** 尾静音预设（ms）：短=反应快但易截断，长=停顿宽容但等得久（高级区可单独覆盖） */
const SILENCE_PRESETS = [600, 900, 1200, 1500] as const;

/**
 * M4 语音输入方式：PTT 按住说话 / VAD 免手持续聆听。
 * v2.4 M3（P0-3/T2）：默认路径收敛为「人话两档」（反应快 / 更宽容，见 voice-quick-config）；
 * 原灵敏度三档 + 尾静音四档退到默认收起的「高级」，保留可调但不阻塞主路径（M0 §4）。
 * 控件值本地乐观（onChange 即切），effect 回同步服务端值/失败回滚。
 */
export function VoiceInputSection({ settings, asrReady, onPatch }: VoiceInputSectionProps) {
  const { t } = useI18n();
  const [mode, setMode] = React.useState(settings.inputMode);
  const [sensitivity, setSensitivity] = React.useState<VadSensitivity>(settings.vadSensitivity);
  const [silenceMs, setSilenceMs] = React.useState(settings.vadSilenceMs);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);

  const SENSITIVITY_OPTIONS: Array<{ value: VadSensitivity; label: string; hint: string }> = [
    { value: 'high', label: t('voice.input.sensitivityHigh'), hint: t('voice.input.sensitivityHighHint') },
    { value: 'balanced', label: t('voice.input.sensitivityBalanced'), hint: t('voice.input.sensitivityBalancedHint') },
    { value: 'low', label: t('voice.input.sensitivityLow'), hint: t('voice.input.sensitivityLowHint') },
  ];

  const PROFILES: Array<{ value: VoiceProfileId; label: string; hint: string }> = [
    { value: 'fast', label: t('voice.input.profileFast'), hint: t('voice.input.profileFastHint') },
    { value: 'tolerant', label: t('voice.input.profileTolerant'), hint: t('voice.input.profileTolerantHint') },
  ];

  React.useEffect(() => setMode(settings.inputMode), [settings.inputMode]);
  React.useEffect(() => setSensitivity(settings.vadSensitivity), [settings.vadSensitivity]);
  React.useEffect(() => setSilenceMs(settings.vadSilenceMs), [settings.vadSilenceMs]);

  const disabled = !asrReady;
  const isVad = mode === 'vad';
  // 档位反查以本地乐观值为准（高级区自定义后回落到「自定义」）
  const profile = profileOf({ vadSensitivity: sensitivity, vadSilenceMs: silenceMs });

  const selectMode = (next: VoiceSettings['inputMode']) => {
    if (disabled || next === mode) return;
    setMode(next);
    void onPatch({ inputMode: next });
  };

  const selectProfile = (next: VoiceProfileId) => {
    if (disabled) return;
    const patch = profilePatch(next);
    setSensitivity(patch.vadSensitivity);
    setSilenceMs(patch.vadSilenceMs);
    void onPatch(patch);
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
          {/* 默认路径：两档人话预设 */}
          <div className="space-y-1.5">
            <Label>{t('voice.input.profileLabel')}</Label>
            <div
              className="inline-flex rounded-md border p-0.5"
              role="group"
              aria-label={t('voice.input.profileLabel')}
            >
              {PROFILES.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={profile === opt.value}
                  data-testid={`voice-profile-${opt.value}`}
                  disabled={disabled}
                  onClick={() => selectProfile(opt.value)}
                  className={cn(
                    'rounded px-3 py-1.5 text-sm transition-colors',
                    profile === opt.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    disabled && 'cursor-not-allowed opacity-50',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground" data-testid="voice-profile-hint">
              {profile === 'fast'
                ? t('voice.input.profileFastHint')
                : profile === 'tolerant'
                  ? t('voice.input.profileTolerantHint')
                  : t('voice.input.profileCustom')}
            </p>
          </div>

          <p className="text-xs text-muted-foreground" data-testid="voice-silence-now">
            {t('voice.input.silenceNow', { seconds: silenceMs / 1000 })}
          </p>

          {/* 高级：默认收起，保留灵敏度/尾静音的单独覆盖 */}
          <div className="rounded-md border">
            <button
              type="button"
              className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
              aria-expanded={advancedOpen}
              data-testid="voice-input-advanced-toggle"
              onClick={() => setAdvancedOpen((prev) => !prev)}
            >
              <ChevronRight
                className={cn('h-3.5 w-3.5 shrink-0 transition-transform', advancedOpen && 'rotate-90')}
              />
              {t('voice.input.advanced')}
            </button>
            {advancedOpen && (
              <div className="space-y-3 px-3 pb-3" data-testid="voice-input-advanced">
                <div className="space-y-1.5">
                  <Label htmlFor="voice-vad-sensitivity">{t('voice.input.sensitivityLabel')}</Label>
                  <SimpleSelect
                    id="voice-vad-sensitivity"
                    data-testid="voice-vad-sensitivity"
                    value={sensitivity}
                    onValueChange={(v) => {
                      const next = v as VadSensitivity;
                      setSensitivity(next);
                      void onPatch({ vadSensitivity: next });
                    }}
                  >
                    {SENSITIVITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {t('voice.input.sensitivityOption', { label: opt.label, hint: opt.hint })}
                      </option>
                    ))}
                  </SimpleSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="voice-vad-silence">{t('voice.input.silenceLabel')}</Label>
                  <SimpleSelect
                    id="voice-vad-silence"
                    data-testid="voice-vad-silence"
                    value={String(silenceMs)}
                    onValueChange={(v) => {
                      const next = Number(v);
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
                  </SimpleSelect>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('voice.input.halfDuplexHint')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
