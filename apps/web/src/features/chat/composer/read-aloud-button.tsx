'use client';

import * as React from 'react';
import { Loader2, Square, Volume2 } from 'lucide-react';
import type { Message } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { withManagedHeaders } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import type { VoicePlayback } from '@/features/voice/runtime';
import { wavToVoiceFrame } from '@/features/events/ui';
import { latestAssistantSpeech, splitSpeechChunks } from './read-aloud-text';

interface Props {
  messages: Message[];
  ttsReady: boolean;
  /** 角色声线；缺省时服务端按当前 avatarModelId 绑定解析 */
  speakerId?: number;
  playback: VoicePlayback;
  conversationId: string | null;
}

/**
 * 会话下栏朗读按钮：点击朗读最新助手回复，再点取消。
 * 复用 /api/voice/tts 合成与唯一播放队列（与自动朗读/事件台词共用音频出口）。
 */
export function ReadAloudButton({ messages, ttsReady, speakerId, playback, conversationId }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const [reading, setReading] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  // playback 每次渲染都是新对象：用 ref 持有最新引用，清理/停止时才不会误伤新一轮
  const playbackRef = React.useRef(playback);
  playbackRef.current = playback;
  const speech = React.useMemo(() => latestAssistantSpeech(messages), [messages]);

  const stop = React.useCallback(() => {
    const controller = abortRef.current;
    if (!controller) return;
    abortRef.current = null;
    controller.abort();
    playbackRef.current.cancel();
    setReading(false);
  }, []);

  // 切换会话或卸载：中止本轮朗读，避免旧文章残留
  const conversationRef = React.useRef(conversationId);
  React.useEffect(() => {
    if (conversationRef.current === conversationId) return;
    conversationRef.current = conversationId;
    stop();
  }, [conversationId, stop]);
  React.useEffect(() => () => stop(), [stop]);

  const start = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setReading(true);
    const queue = playbackRef.current;
    // 手动朗读优先：先停掉可能正在播放的自动朗读，再从开头读最新回复
    queue.cancel();
    controller.signal.addEventListener('abort', () => queue.cancel(), { once: true });
    try {
      for (const chunk of splitSpeechChunks(speech ?? '')) {
        if (controller.signal.aborted) return;
        const response = await fetch(
          API.voiceTts,
          withManagedHeaders({
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: chunk, speakerId }),
            signal: controller.signal,
          }),
        );
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(`tts ${response.status}`);
        const frame = wavToVoiceFrame(await response.arrayBuffer(), chunk);
        if (!frame) throw new Error('tts-invalid-wav');
        queue.enqueue(frame);
        await queue.waitDrained(controller.signal);
      }
    } catch {
      if (!controller.signal.aborted) toast.error(t('voice.readAloud.failed'));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setReading(false);
      }
    }
  };

  const empty = !speech && !reading;
  const label = !ttsReady
    ? t('voice.readAloud.unavailable')
    : empty
      ? t('voice.readAloud.empty')
      : reading
        ? t('voice.readAloud.stop')
        : t('voice.readAloud.start');

  return (
    <Button
      type="button"
      variant={reading ? 'default' : 'outline'}
      size="icon"
      aria-pressed={reading}
      aria-label={label}
      title={label}
      disabled={!ttsReady || empty}
      data-testid="read-aloud-button"
      onClick={() => {
        if (reading) stop();
        else void start();
      }}
    >
      {reading ? (
        playback.speaking ? (
          <Square className="h-4 w-4" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin" />
        )
      ) : (
        <Volume2 className="h-4 w-4" />
      )}
    </Button>
  );
}
