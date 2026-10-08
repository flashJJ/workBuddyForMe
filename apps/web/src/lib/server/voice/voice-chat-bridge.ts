import {
  StreamingSentenceSplitter,
  encodePcm16Wav,
  stripForTts,
  type TtsEngine,
} from '@wbfm/voice';
import type { OrchestratorEvent } from '@wbfm/core/chat';
import type { WebChatSseEvent } from '@/lib/api/sse-events';

/** 语音桥事件（复用 SSE wire 契约，sse-stream 直接可序列化）；v1.1 M4 起从 wire 真源派生 */
export type VoiceBridgeEvent = WebChatSseEvent;

export interface VoiceBridgeDeps {
  tts: Pick<TtsEngine, 'synthesize'>;
  signal?: AbortSignal;
}

/** 语音开始帧（speaking 状态机幂等由 speaking 标志保证） */
function speakingEvent(): VoiceBridgeEvent {
  return { event: 'voice_state', data: { state: 'speaking' } };
}

/** 纯表情/空白片段：仅驱动字幕，不出声 */
function silentFragmentEvent(fragment: string): VoiceBridgeEvent {
  return { event: 'voice_audio', data: { fragment, spoken: '', audio: null, sampleRate: 0, final: false } };
}

/** TTS 失败降级：只出字幕，不阻断对话 */
function synthFailedEvent(fragment: string, spoken: string): VoiceBridgeEvent {
  return { event: 'voice_audio', data: { fragment, spoken, audio: null, sampleRate: 0, final: false } };
}

/** 流收尾终态帧（前端据此排空队列、结束播放会话） */
function finalAudioEvent(): VoiceBridgeEvent {
  return { event: 'voice_audio', data: { fragment: '', spoken: '', audio: null, sampleRate: 0, final: true } };
}

function idleEvent(): VoiceBridgeEvent {
  return { event: 'voice_state', data: { state: 'idle' } };
}

function voiceAudioEvent(
  fragment: string,
  spoken: string,
  audio: string,
  sampleRate: number,
): VoiceBridgeEvent {
  return { event: 'voice_audio', data: { fragment, spoken, audio, sampleRate, final: false } };
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

  const emitFragment = async function* (fragment: string) {
    const spoken = stripForTts(fragment);
    if (!spoken) {
      // 纯表情/空白片段：仅驱动字幕，不出声
      yield silentFragmentEvent(fragment);
      return;
    }
    try {
      const { samples, sampleRate } = await deps.tts.synthesize(spoken);
      const audio = Buffer.from(encodePcm16Wav(samples, sampleRate)).toString('base64');
      if (!speaking) {
        speaking = true;
        yield speakingEvent();
      }
      yield voiceAudioEvent(fragment, spoken, audio, sampleRate);
    } catch (error) {
      console.error('[voice:bridge] 单句合成失败，降级为纯字幕：', error);
      yield synthFailedEvent(fragment, spoken);
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
        yield finalAudioEvent();
        if (speaking) {
          speaking = false;
          yield idleEvent();
        }
      }
    }
  } finally {
    if (speaking) {
      yield idleEvent();
    }
  }
}
