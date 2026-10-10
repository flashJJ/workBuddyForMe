'use client';

import * as React from 'react';
import type { VoiceSettings, VoiceSettingsUpdateInput } from '@wbfm/shared/schemas';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/use-i18n';
import { ToggleRow } from './voice-engine-params';

interface Props {
  settings: VoiceSettings;
  onPatch: (patch: VoiceSettingsUpdateInput) => Promise<void>;
}

/** 阈值选项（分钟 → 秒，须落在 schema 30-3600 区间） */
const IDLE_OPTIONS = [
  { minutes: 5, seconds: 300 },
  { minutes: 10, seconds: 600 },
  { minutes: 15, seconds: 900 },
  { minutes: 30, seconds: 1800 },
];

/**
 * F8 AI 主动说话设置：开关 + 空闲阈值。
 * 生效前提：已开启 Live2D 形象或桌宠模式（气泡出口）；开启朗读后搭话会自动出声。
 */
export function ProactiveSection({ settings, onPatch }: Props) {
  const { t } = useI18n();
  const visualOutlet = settings.avatarEnabled || settings.petEnabled;

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="voice-proactive-section">
      <p className="text-sm font-medium">{t('voice.proactive.title')}</p>
      <ToggleRow
        id="proactive-enabled"
        label={t('voice.proactive.toggleLabel')}
        hint={
          visualOutlet
            ? t('voice.proactive.toggleHint')
            : t('voice.proactive.toggleHintNoOutlet')
        }
        checked={settings.proactiveEnabled}
        disabled={false}
        onChange={(next) => void onPatch({ proactiveEnabled: next })}
      />

      <div className="space-y-1.5">
        <Label htmlFor="proactive-idle">{t('voice.proactive.idleLabel')}</Label>
        <Select
          id="proactive-idle"
          data-testid="proactive-idle"
          value={String(settings.proactiveIdleSeconds)}
          disabled={!settings.proactiveEnabled}
          onChange={(e) => void onPatch({ proactiveIdleSeconds: Number(e.target.value) })}
        >
          {IDLE_OPTIONS.map((opt) => (
            <option key={opt.seconds} value={opt.seconds}>
              {t('voice.proactive.idleMinutes', { minutes: opt.minutes })}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          {t('voice.proactive.idleHint')}
          {settings.ttsEnabled ? '' : t('voice.proactive.idleHintNoTts')}
        </p>
      </div>
    </div>
  );
}
