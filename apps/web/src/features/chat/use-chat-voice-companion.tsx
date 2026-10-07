'use client';

import * as React from 'react';
import { useVoicePlayback } from '../voice/use-voice-playback';
import { useVoiceSettings } from '../voice/use-voice-settings';
import { useHandsfreeVoice } from '../voice/use-handsfree-voice';
import { useProactiveChat, type ProactiveBubble } from './use-proactive-chat';
import { useChatSession, type ChatSession } from './use-chat-session';
import { useChatPetRelay } from '../pet/use-chat-pet-relay';
import type { VoiceAudioFrame } from '../voice/audio-playback-queue';

interface CompanionArgs {
  assistantId: string;
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
  hasChatModel: boolean;
}

export interface VoiceCompanion {
  /** 语音设置与模型状态（设置面板/麦克风门控复用） */
  voiceSettings: ReturnType<typeof useVoiceSettings>['settings'];
  voiceModelStatus: ReturnType<typeof useVoiceSettings>['modelStatus'];
  ttsEnabled: boolean;
  handleTtsToggle: (next: boolean) => void;
  session: ChatSession;
  playback: ReturnType<typeof useVoicePlayback>;
  handsfree: ReturnType<typeof useHandsfreeVoice>;
  petOpen: boolean;
  proactiveBubble: ProactiveBubble | null;
  dismissProactive: () => void;
}

/**
 * 对话页语音伴侣接线聚合（M1 TTS / M4 VAD / M4 桌宠 / F8 主动说话）：
 * 主窗是唯一音频与 SSE 出口，桌宠为瘦终端；主动轮复用同一语音通道。
 * 顺序约束：playback → voiceBridge → session → handsfree → proactive → pet relay。
 */
export function useChatVoiceCompanion({
  assistantId,
  conversationId,
  onConversationCreated,
  hasChatModel,
}: CompanionArgs): VoiceCompanion {
  const { settings: voiceSettings, modelStatus: voiceModelStatus, update: updateVoiceSettings } =
    useVoiceSettings();
  const playback = useVoicePlayback();
  const [ttsEnabled, setTtsEnabled] = React.useState(false);
  React.useEffect(() => {
    if (voiceSettings) setTtsEnabled(voiceSettings.ttsEnabled);
  }, [voiceSettings]);

  const handleTtsToggle = React.useCallback(
    (next: boolean) => {
      setTtsEnabled(next);
      void updateVoiceSettings({ ttsEnabled: next });
    },
    [updateVoiceSettings],
  );

  // 桌宠音频帧中继回调用 ref 持有最新引用，供稳定的 voiceBridge 闭包读取
  const petRelayRef = React.useRef<(frame: VoiceAudioFrame) => void>(() => {});
  // 依赖只取稳定的 useCallback 引用（playback 对象每渲染新建，不能整体进 deps，
  // 否则流式 delta 每帧重建 voiceBridge → session/handsfree 回调链全部失效重订阅）
  const voiceBridge = React.useMemo(
    () => ({
      ttsEnabled,
      onAudio: (frame: VoiceAudioFrame) => {
        playback.enqueue(frame);
        petRelayRef.current(frame);
      },
      cancelPlayback: playback.cancel,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ttsEnabled, playback.enqueue, playback.cancel],
  );

  const session = useChatSession(assistantId, conversationId, onConversationCreated, voiceBridge);

  const handsfree = useHandsfreeVoice({
    asrReady: !!voiceModelStatus?.asrReady,
    canArm: !!voiceSettings?.asrEnabled && voiceSettings.inputMode === 'vad',
    sensitivity: voiceSettings?.vadSensitivity ?? 'balanced',
    silenceMs: voiceSettings?.vadSilenceMs ?? 900,
    playback,
    onRecognizedSend: (text) => session.send(text),
    onAbortTurn: session.stop,
  });

  const proactive = useProactiveChat({
    assistantId,
    conversationId,
    voiceSettings,
    ttsReady: !!voiceModelStatus?.ttsReady,
    hasVisualOutlet: !!voiceSettings?.avatarEnabled || !!voiceSettings?.petEnabled,
    hasChatModel,
    busy: session.streaming || handsfree.voiceState !== 'idle',
    onAudio: voiceBridge.onAudio,
    onCancelPlayback: voiceBridge.cancelPlayback,
  });

  const { petOpen, onAudioFrame: relayPetAudio } = useChatPetRelay({
    voiceSettings,
    voiceState: handsfree.voiceState,
    messages: session.messages,
    conversationId,
    subscribeLevel: playback.subscribeLevel,
    proactiveContent: proactive.bubble?.content ?? null,
  });
  petRelayRef.current = relayPetAudio;

  return {
    voiceSettings,
    voiceModelStatus,
    ttsEnabled,
    handleTtsToggle,
    session,
    playback,
    handsfree,
    petOpen,
    proactiveBubble: proactive.bubble,
    dismissProactive: proactive.dismiss,
  };
}
