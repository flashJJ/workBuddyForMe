'use client';

import * as React from 'react';
import type { VoiceSettings, VadSensitivity } from '@wbfm/shared/schemas';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

interface VoiceInputSectionProps {
  settings: VoiceSettings;
  asrReady: boolean;
  onPatch: (patch: Partial<VoiceSettings>) => Promise<void> | void;
}

/** 尾静音预设（ms）：短=反应快但易截断，长=停顿宽容但等得久 */
const SILENCE_PRESETS = [600, 900, 1200, 1500] as const;
const SENSITIVITY_OPTIONS: Array<{ value: VadSensitivity; label: string; hint: string }> = [
  { value: 'high', label: '高', hint: '小声也能触发，安静/耳机环境' },
  { value: 'balanced', label: '均衡', hint: '大多数环境' },
  { value: 'low', label: '低', hint: '外放/嘈杂环境，减少回声误触发' },
];

/**
 * M4 语音输入方式：PTT 按住说话 / VAD 免手持续聆听。
 * 控件值本地乐观（onChange 即切），effect 回同步服务端值/失败回滚——
 * 与 M2 ToggleRow 同源，规避受控控件二次点击翻转。
 */
export function VoiceInputSection({ settings, asrReady, onPatch }: VoiceInputSectionProps) {
  const [mode, setMode] = React.useState(settings.inputMode);
  const [sensitivity, setSensitivity] = React.useState<VadSensitivity>(settings.vadSensitivity);
  const [silenceMs, setSilenceMs] = React.useState(settings.vadSilenceMs);

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
        <p className="text-sm font-medium">语音输入方式</p>
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="语音输入方式">
          {(
            [
              { value: 'ptt', label: '按住说话' },
              { value: 'vad', label: '免手持续聆听' },
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
          <p className="text-xs text-warning">请先下载离线语音识别模型后再切换输入方式。</p>
        )}
      </div>

      {isVad && (
        <div className="space-y-3" data-testid="voice-vad-params">
          <div className="space-y-1.5">
            <Label htmlFor="voice-vad-sensitivity">聆听灵敏度</Label>
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
                  {opt.label}（{opt.hint}）
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="voice-vad-silence">说完后停顿多久自动发送</Label>
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
                  {ms / 1000} 秒{ms === 600 ? '（推荐，跟手）' : ''}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            半双工模式：助手朗读时麦克风自动抑制回声，需要明显更大的声音才能打断；建议使用耳机。
          </p>
        </div>
      )}
    </div>
  );
}
