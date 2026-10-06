'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  const { modelStatus } = useVoiceSettings();
  const ttsReady = modelStatus?.ttsReady ?? false;

  const label = !ttsReady
    ? '语音朗读不可用：请在设置中下载离线语音模型'
    : enabled
      ? '关闭语音朗读'
      : '开启语音朗读（离线）';

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
