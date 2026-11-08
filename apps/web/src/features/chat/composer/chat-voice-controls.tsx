'use client';

import {
  HandsfreeMicButton,
  MicButton,
  VoiceQuickStartButton,
  VoiceToggle,
} from '@/features/voice/ui';
import type { HandsfreeVoice } from '@/features/voice/runtime';
import type { VoiceDraft } from '@/features/voice/draft';

interface Props {
  ttsEnabled: boolean;
  onTtsToggle: (next: boolean) => void;
  asrEnabled: boolean;
  inputMode: 'ptt' | 'vad' | undefined;
  handsfree: HandsfreeVoice;
  streaming: boolean;
  /** v2.25：PTT 识别后只填草稿（+模型润色），点发送才发出 */
  voiceDraft: VoiceDraft;
}

/**
 * 输入框左侧的语音控件簇：
 * v2.4 M3（D7 入口②）一键开启语音对话（就绪即当场武装免手）+ 朗读开关 + PTT / 免手麦克风。
 */
export function ChatVoiceControls(props: Props) {
  const { ttsEnabled, onTtsToggle, asrEnabled, inputMode, handsfree, streaming, voiceDraft } =
    props;
  return (
    <>
      <VoiceQuickStartButton handsfree={handsfree} />
      <VoiceToggle enabled={ttsEnabled} onEnabledChange={onTtsToggle} />
      {asrEnabled &&
        (inputMode === 'vad' ? (
          <HandsfreeMicButton handsfree={handsfree} />
        ) : (
          <MicButton
            onRecognizedText={voiceDraft.insert}
            polishing={voiceDraft.polishing > 0}
            disabled={streaming}
          />
        ))}
    </>
  );
}
