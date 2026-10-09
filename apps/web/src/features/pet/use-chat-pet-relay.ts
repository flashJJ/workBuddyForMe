'use client';

import * as React from 'react';
import type { Message } from '@wbfm/shared/types';
import type { PetVoiceState } from '@wbfm/shared/pet';
import type { VoiceSettings } from '@wbfm/shared/schemas';
import type { VoiceAudioFrame } from '@/features/voice/audio-playback-queue';
import { getPetBridge } from './pet-bridge';
import { usePetOpenState, usePetVoiceRelay } from './use-pet-voice-relay';

interface UseChatPetRelayArgs {
  voiceSettings: VoiceSettings | null | undefined;
  voiceState: PetVoiceState;
  messages: Message[];
  conversationId: string | null;
  subscribeLevel: (sink: (level: number) => void) => () => void;
  /** F8：主动轮气泡文本（存在时桌宠表情优先跟随它） */
  proactiveContent?: string | null;
}

interface UseChatPetRelayResult {
  /** 桌宠窗是否打开（主窗形象栏据此让位） */
  petOpen: boolean;
  /** 喂给语音桥 onAudio：同时入播放队列（由调用方负责）与桌宠字幕中继 */
  onAudioFrame: (frame: VoiceAudioFrame) => void;
}

/**
 * 对话页桌宠接线（M4 伴身）：
 * - 桥存在且设置 petEnabled=true 时，挂载后一次性自动开窗（StrictMode ref 守卫防双开）；
 * - 桌宠打开期间语音表现经 IPC 中继，主窗 rail 是否让位由 petOpen 决定。
 */
export function useChatPetRelay({
  voiceSettings,
  voiceState,
  messages,
  conversationId,
  subscribeLevel,
  proactiveContent = null,
}: UseChatPetRelayArgs): UseChatPetRelayResult {
  const petBridge = React.useMemo(() => getPetBridge(), []);
  const petOpen = usePetOpenState();
  const onAudioFrame = usePetVoiceRelay({
    active: petOpen,
    voiceState,
    messages,
    conversationId,
    subscribeLevel,
    proactiveContent,
  });

  const autoOpenTried = React.useRef(false);
  React.useEffect(() => {
    if (!petBridge || !voiceSettings || autoOpenTried.current) return;
    autoOpenTried.current = true;
    if (!voiceSettings.petEnabled) return;
    void petBridge
      .isOpen()
      .then((open) => {
        if (!open) void petBridge.open(voiceSettings.avatarModelId || 'haru');
      })
      .catch(() => undefined);
  }, [petBridge, voiceSettings]);

  return { petOpen, onAudioFrame };
}
