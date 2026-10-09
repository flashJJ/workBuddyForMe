'use client';

import * as React from 'react';
import type { VoiceSettings, VoiceSettingsUpdateInput } from '@wbfm/shared/schemas';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
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
  const visualOutlet = settings.avatarEnabled || settings.petEnabled;

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="voice-proactive-section">
      <p className="text-sm font-medium">AI 主动说话</p>
      <ToggleRow
        id="proactive-enabled"
        label="空闲时主动搭话"
        hint={
          visualOutlet
            ? '空闲达到阈值后，角色会主动说一句简短的话（不写入对话历史）'
            : '需先在下方「Live2D 形象」开启形象栏或桌宠模式，搭话才有展示出口'
        }
        checked={settings.proactiveEnabled}
        disabled={false}
        onChange={(next) => void onPatch({ proactiveEnabled: next })}
      />

      <div className="space-y-1.5">
        <Label htmlFor="proactive-idle">空闲阈值</Label>
        <Select
          id="proactive-idle"
          data-testid="proactive-idle"
          value={String(settings.proactiveIdleSeconds)}
          disabled={!settings.proactiveEnabled}
          onChange={(e) => void onPatch({ proactiveIdleSeconds: Number(e.target.value) })}
        >
          {IDLE_OPTIONS.map((opt) => (
            <option key={opt.seconds} value={opt.seconds}>
              {opt.minutes} 分钟
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          期间无对话操作才触发；你发消息或正在朗读时自动顺延，绝不打断当前对话。
          {settings.ttsEnabled ? '' : '（未开启朗读时仅显示文字气泡，不会出声）'}
        </p>
      </div>
    </div>
  );
}
