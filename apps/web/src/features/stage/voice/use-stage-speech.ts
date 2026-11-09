'use client';

import * as React from 'react';
import type { StageCastMember, StageSlot } from '@wbfm/shared/schemas';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { StageLine, StageMode } from '../use-stage-controller';
import { useStageVoice, type StageVoice } from './use-stage-voice';

interface Options {
  mode: StageMode;
  cast: StageCastMember[];
  sayLine: (slot?: StageSlot) => StageLine | null;
  clearSpeech: (slot: StageSlot, expected?: string) => void;
}

export interface StageSpeech {
  /** 让指定角色说一句（mock 演示）：字幕先行，再按角色声线合成语音 */
  say: (slot?: StageSlot) => void;
  /** 打断当前语音（散焦/重说时调用） */
  stop: () => void;
  voice: StageVoice;
}

/**
 * 舞台台词语音编排：把「字幕 + TTS + 口型复位」串成一条流程。
 * 合成失败时保留字幕并用文本长度估算口型时长，模型缺失不阻断演示。
 */
export function useStageSpeech({ mode, cast, sayLine, clearSpeech }: Options): StageSpeech {
  const { t } = useI18n();
  const toast = useToast();
  const voice = useStageVoice();

  const say = React.useCallback(
    (slot?: StageSlot) => {
      if (mode !== 'mock') return;
      const line = sayLine(slot);
      if (!line) return;
      const member = cast.find((m) => m.slot === line.slot);
      const fallbackMs = Math.min(12000, Math.max(1600, line.text.length * 200));
      void (async () => {
        const result = await voice.speak(line.text, member?.avatarModelId ?? '');
        if (result === 'failed') {
          toast.error(t('voice.readAloud.unavailable'));
          await new Promise((resolve) => setTimeout(resolve, fallbackMs));
        }
      })()
        .catch(() => undefined)
        .finally(() => clearSpeech(line.slot, line.text));
    },
    [cast, clearSpeech, mode, sayLine, t, toast, voice],
  );

  const stop = React.useCallback(() => voice.stop(), [voice]);

  return { say, stop, voice };
}
