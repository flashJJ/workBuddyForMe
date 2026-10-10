'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useVoiceSettings } from './use-voice-settings';

interface VoiceToggleProps {
  /** 外部受控（对话页也需要读到该值决定是否带 voice 参数） */
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}

/**
 * 对话页朗读开关（v1.0 M1 最小形态）。
 * TTS 模型未就绪时禁止打开并给出原因（M2 设置面板提供下载入口）。
 */
export function VoiceToggle({ enabled, onEnabledChange }: VoiceToggleProps) {
  const { t } = useI18n();
  const { modelStatus } = useVoiceSettings();
  const ttsReady = modelStatus?.ttsReady ?? false;

  const label = !ttsReady
    ? t('voice.toggle.unavailable')
    : enabled
      ? t('voice.toggle.off')
      : t('voice.toggle.on');

  return (
    <Button
      type="button"
      variant={enabled ? 'default' : 'outline'}
      size="icon"
      aria-pressed={enabled}
      aria-label={label}
      title={label}
      disabled={!ttsReady}
      onClick={() => onEnabledChange(!enabled)}
    >
      {enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
    </Button>
  );
}
