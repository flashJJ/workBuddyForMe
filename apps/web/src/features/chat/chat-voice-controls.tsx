'use client';

import { VoiceQuickStartButton } from '../voice/voice-quick-start-button';
import { VoiceToggle } from '../voice/voice-toggle';
import { MicButton } from '../voice/mic-button';
import { HandsfreeMicButton } from '../voice/handsfree-mic-button';
import type { HandsfreeVoice } from '../voice/use-handsfree-voice';

interface Props {
  ttsEnabled: boolean;
  onTtsToggle: (next: boolean) => void;
  asrEnabled: boolean;
  inputMode: 'ptt' | 'vad' | undefined;
  handsfree: HandsfreeVoice;
  streaming: boolean;
  onRecognizedSend: (text: string) => void;
}

/**
 * 输入框左侧的语音控件簇：
 * v2.4 M3（D7 入口②）一键开启语音对话（就绪即当场武装免手）+ 朗读开关 + PTT / 免手麦克风。
 */
export function ChatVoiceControls(props: Props) {
  const { ttsEnabled, onTtsToggle, asrEnabled, inputMode, handsfree, streaming, onRecognizedSend } =
    props;
  return (
    <>
      <VoiceQuickStartButton handsfree={handsfree} />
      <VoiceToggle enabled={ttsEnabled} onEnabledChange={onTtsToggle} />
      {asrEnabled &&
        (inputMode === 'vad' ? (
          <HandsfreeMicButton handsfree={handsfree} />
        ) : (
          <MicButton onRecognizedSend={onRecognizedSend} disabled={streaming} />
        ))}
    </>
  );
}
