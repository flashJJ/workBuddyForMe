'use client';

import type { Message } from '@wbfm/shared/types';
import { getAvatarSpeakerId } from '@wbfm/shared/schemas';
import {
  HandsfreeMicButton,
  MicButton,
  VoiceQuickStartButton,
  VoiceToggle,
} from '@/features/voice/ui';
import { useVoiceSettings } from '@/features/voice/runtime';
import type { HandsfreeVoice, VoicePlayback } from '@/features/voice/runtime';
import type { VoiceDraft } from '@/features/voice/draft';
import { ReadAloudButton } from './read-aloud-button';

interface Props {
  ttsEnabled: boolean;
  onTtsToggle: (next: boolean) => void;
  asrEnabled: boolean;
  inputMode: 'ptt' | 'vad' | undefined;
  handsfree: HandsfreeVoice;
  streaming: boolean;
  /** 朗读最新回复：消息列表与共享播放队列 */
  messages: Message[];
  playback: VoicePlayback;
  conversationId: string | null;
  /** v2.25：PTT 识别后只填草稿（+模型润色），点发送才发出 */
  voiceDraft: VoiceDraft;
}

/**
 * 输入框左侧的语音控件簇：
 * v2.4 M3（D7 入口②）一键开启语音对话（就绪即当场武装免手）+ 朗读开关 + PTT / 免手麦克风；
 * v2.35 追加「朗读最新回复」手动按钮（开始/取消）。
 */
export function ChatVoiceControls(props: Props) {
  const {
    ttsEnabled,
    onTtsToggle,
    asrEnabled,
    inputMode,
    handsfree,
    streaming,
    messages,
    playback,
    conversationId,
    voiceDraft,
  } = props;
  // 语音设置/模型就绪态与 VoiceToggle 共用同一份查询缓存，不产生额外请求
  const { settings, modelStatus } = useVoiceSettings();
  return (
    <>
      <VoiceQuickStartButton handsfree={handsfree} />
      <VoiceToggle enabled={ttsEnabled} onEnabledChange={onTtsToggle} />
      <ReadAloudButton
        messages={messages}
        ttsReady={Boolean(modelStatus?.ttsReady)}
        speakerId={settings ? getAvatarSpeakerId(settings.avatarModelId) : undefined}
        playback={playback}
        conversationId={conversationId}
      />
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
