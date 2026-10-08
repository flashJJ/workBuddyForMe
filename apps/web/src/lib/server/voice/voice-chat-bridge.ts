import type { SsePayloadMap } from '@wbfm/shared/api';
import {
  StreamingSentenceSplitter,
  encodePcm16Wav,
  stripForTts,
  type TtsEngine,
} from '@wbfm/voice';
import type { OrchestratorEvent } from '@wbfm/core/chat';

/** 语音桥事件（复用 SSE wire 契约，sse-stream 直接可序列化） */
export type VoiceBridgeEvent =
  | OrchestratorEvent
  | { event: 'voice_audio'; data: SsePayloadMap['voice_audio'] }
  | { event: 'voice_state'; data: SsePayloadMap['voice_state'] };

export interface VoiceBridgeDeps {
  tts: Pick<TtsEngine, 'synthesize'>;
  signal?: AbortSignal;
}

/**
 * 把 orchestrator 的文本事件流包装为「文本 + 语音」事件流。
 *
 * - delta 可能是增量块（正常流式）或全文（非流式 fallback），用「已朗读前缀」差分；
 * - 切句器首逗号快出，逐句合成后插在文本事件之间；
 * - 不改动原事件、不吞错误；voice 仅旁路追加；
 * - 合成失败的句子只出字幕（audio=null），不阻断对话。
 */
export async function* withVoice(
  source: AsyncIterable<OrchestratorEvent>,
  deps: VoiceBridgeDeps,
): AsyncGenerator<VoiceBridgeEvent> {
  const splitter = new StreamingSentenceSplitter();
  let emittedText = '';
  let speaking = false;

  const enterSpeaking = async function* () {
    if (!speaking) {
      speaking = true;
      yield { event: 'voice_state', data: { state: 'speaking' } } as VoiceBridgeEvent;
    }
  };

  const emitFragment = async function* (fragment: string) {
    const spoken = stripForTts(fragment);
    if (!spoken) {
      // 纯表情/空白片段：仅驱动字幕，不出声
      yield {
        event: 'voice_audio',
        data: { fragment, spoken: '', audio: null, sampleRate: 0, final: false },
      } as VoiceBridgeEvent;
      return;
    }
    try {
      const { samples, sampleRate } = await deps.tts.synthesize(spoken);
      const audio = Buffer.from(encodePcm16Wav(samples, sampleRate)).toString('base64');
      yield* enterSpeaking();
      yield {
        event: 'voice_audio',
        data: { fragment, spoken, audio, sampleRate, final: false },
      } as VoiceBridgeEvent;
    } catch (error) {
      console.error('[voice:bridge] 单句合成失败，降级为纯字幕：', error);
      yield {
        event: 'voice_audio',
        data: { fragment, spoken, audio: null, sampleRate: 0, final: false },
      } as VoiceBridgeEvent;
    }
  };

  try {
    for await (const event of source) {
      if (deps.signal?.aborted) break;

      // 先放行原始事件（文本先到，语音帧紧随其后），保证纯文字语义不被插入打乱
      yield event;

      if (event.event === 'delta') {
        const content = event.data.content;
        // 增量/全文兼容：只取「已朗读前缀」之后的新增部分
        const suffix = content.startsWith(emittedText)
          ? content.slice(emittedText.length)
          : content;
        emittedText = content.startsWith(emittedText) ? content : emittedText + content;

        for (const fragment of splitter.push(suffix)) {
          yield* emitFragment(fragment);
        }
      }

      if (event.event === 'done' || event.event === 'error') {
        for (const fragment of splitter.flush()) {
          yield* emitFragment(fragment);
        }
        // 收尾终态帧（前端据此排空队列、结束播放会话）
        yield {
          event: 'voice_audio',
          data: { fragment: '', spoken: '', audio: null, sampleRate: 0, final: true },
        } as VoiceBridgeEvent;
        if (speaking) {
          speaking = false;
          yield { event: 'voice_state', data: { state: 'idle' } } as VoiceBridgeEvent;
        }
      }
    }
  } finally {
    if (speaking) {
      yield { event: 'voice_state', data: { state: 'idle' } } as VoiceBridgeEvent;
    }
  }
}
