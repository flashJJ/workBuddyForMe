'use client';

import * as React from 'react';
import { Mic, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useVoiceSettings } from './use-voice-settings';
import { useVoiceRecorder } from './use-voice-recorder';

interface MicButtonProps {
  /** 识别完成后发送文本（流式中禁用，避免并发轮次） */
  onRecognizedSend: (text: string) => void;
  disabled?: boolean;
}

/**
 * 按住说话（PTT）：pointerdown 开始录音，pointerup 识别并自动发送。
 * ASR 模型未就绪时禁用（设置面板提供下载入口）。
 *
 * 关键：按下期间绝不能切换 disabled（会令浏览器丢失活动指针、立即触发 cancel/up），
 * 并用 setPointerCapture 保证手指/鼠标小幅滑出按钮仍能收到 pointerup。
 */
export function MicButton({ onRecognizedSend, disabled }: MicButtonProps) {
  const { t } = useI18n();
  const { modelStatus } = useVoiceSettings();
  const recorder = useVoiceRecorder();
  const toast = useToast();
  const asrReady = modelStatus?.asrReady ?? false;
  const busy = disabled ?? false;
  const recording = recorder.state === 'recording';
  const recognizing = recorder.state === 'recognizing';

  React.useEffect(() => {
    if (recorder.error) toast.error(recorder.error.message);
  }, [recorder.error, toast]);

  const handlePointerUp = React.useCallback(async () => {
    if (recorder.state !== 'recording') return;
    const text = await recorder.stopAndRecognize();
    if (text.trim()) onRecognizedSend(text.trim());
  }, [recorder, onRecognizedSend]);

  const label = !asrReady
    ? t('voice.mic.unavailable')
    : recording
      ? t('voice.mic.recording')
      : t('voice.mic.holdToTalk');

  return (
    <Button
      type="button"
      variant={recording ? 'default' : 'outline'}
      size="icon"
      className="touch-none select-none"
      aria-label={label}
      title={label}
      // 注意：requesting（麦克风申请中）阶段保持启用，避免按下途中 disabled 导致指针丢失
      disabled={!asrReady || busy || recognizing}
      data-testid="mic-button"
      data-state={recorder.state}
      onPointerDown={(event) => {
        event.preventDefault();
        if (!asrReady || busy || recognizing) return;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* 旧环境无指针捕获也不影响基础 PTT */
        }
        void recorder.start();
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        // 先结束录音（同步把状态切出 recording），捕获随后随 pointerup 隐式释放，
        // onLostPointerCapture 的守卫便不会误取消
        void handlePointerUp();
      }}
      onPointerCancel={() => recorder.cancel()}
      onLostPointerCapture={() => {
        // 系统级打断（来电/焦点切换/触摸被浏览器手势抢走）：未完成的录音直接取消
        if (recorder.state === 'recording') recorder.cancel();
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {recognizing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </Button>
  );
}
