'use client';

import * as React from 'react';
import { AudioLines, Loader2, Mic, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { HandsfreeVoice } from './use-handsfree-voice';

interface HandsfreeMicButtonProps {
  handsfree: HandsfreeVoice;
  disabled?: boolean;
}

/**
 * M4 免手持续聆听开关：再次点击关闭（关闭即无任何麦克风采集）。
 * 按钮不随流式回复禁用——助手说话时它必须保持可触发，开口即 barge-in。
 */
export function HandsfreeMicButton({ handsfree, disabled }: HandsfreeMicButtonProps) {
  const { t } = useI18n();
  const toast = useToast();
  const { armed, voiceState, monitorError, asrError } = handsfree;

  React.useEffect(() => {
    if (monitorError) toast.error(monitorError.message);
  }, [monitorError, toast]);

  React.useEffect(() => {
    if (asrError) toast.error(t('voice.handsfree.asrFailed', { message: asrError }));
  }, [asrError, toast, t]);

  const label = !armed
    ? t('voice.handsfree.enable')
    : voiceState === 'listening'
      ? t('voice.handsfree.listening')
      : voiceState === 'thinking'
        ? t('voice.handsfree.thinking')
        : voiceState === 'speaking'
          ? t('voice.handsfree.speaking')
          : t('voice.handsfree.idle');

  return (
    <span className="flex items-center gap-1.5">
      <Button
        type="button"
        variant={armed ? 'default' : 'outline'}
        size="icon"
        className="touch-none select-none"
        aria-label={label}
        title={label}
        aria-pressed={armed}
        data-testid="handsfree-button"
        data-state={armed ? voiceState : 'off'}
        onClick={() => handsfree.toggle()}
      >
        {!armed ? (
          <Mic className="h-4 w-4" />
        ) : voiceState === 'thinking' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : voiceState === 'listening' ? (
          <Radio className="h-4 w-4 animate-pulse" />
        ) : (
          <AudioLines className="h-4 w-4" />
        )}
      </Button>
      {armed && (
        <span
          className="flex h-4 w-20 items-end overflow-hidden rounded-sm bg-muted"
          title={t('voice.handsfree.capturePhase', { phase: handsfree.monitorPhase })}
          data-testid="handsfree-level"
          data-phase={handsfree.monitorPhase}
          data-level={handsfree.micLevel.toFixed(3)}
        >
          <span
            className="block h-full bg-primary transition-[width] duration-100"
            style={{ width: `${Math.min(1, handsfree.micLevel) * 100}%` }}
          />
        </span>
      )}
    </span>
  );
}
