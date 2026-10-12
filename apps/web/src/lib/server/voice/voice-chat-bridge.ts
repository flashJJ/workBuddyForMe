import {
  chunkForTts,
  encodePcm16Wav,
  stripForTts,
  StreamingSentenceSplitter,
  type TtsEngine,
} from '@wbfm/voice';
import { stripEmotionSignalBlock } from '@wbfm/shared/schemas';
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
 * 关键时序（v1.4.1 热修）：合成在后台保序链上并行推进，**绝不阻塞文本事件**——
 * delta/全文事件先即时下发（字幕零背压），已合成音频帧在下一个文本事件前
 * 排空插送；done 文本帧同样即时下发（前端据此立刻落账完成态），之后 SSE
 * 仅为剩余音频帧保活，收尾再发 final/idle。
 *
 * - 增量块（正常流式）或全文（非流式 fallback）用「已朗读前缀」差分；
 * - 长句经 chunkForTts 切块合成（首块携带原 fragment 驱动字幕/桌宠气泡）；
 * - 合成失败的句子只出字幕（audio=null），不阻断对话。
 */
export async function* withVoice(
  source: AsyncIterable<OrchestratorEvent>,
  deps: VoiceBridgeDeps,
): AsyncGenerator<VoiceBridgeEvent> {
  const splitter = new StreamingSentenceSplitter();
  /** 模型累计原始全文（增量/全文兼容） */
  let rawFull = '';
  /** 已送入切句器的「清洗后」全文（v1.6：情绪尾块永不进入 TTS） */
  let spokenFull = '';
  let speaking = false;

  // 已合成、待下发的语音帧 FIFO
  const ready: VoiceBridgeEvent[] = [];
  /** 保序合成链：片段按入队顺序串行合成，合成 promise 不阻塞主管线 */
  let chain: Promise<void> = Promise.resolve();

  const synthFragment = async (fragment: string): Promise<void> => {
    if (deps.signal?.aborted) return;
    const spoken = stripForTts(fragment);
    if (!spoken) {
      ready.push(silentFragmentEvent(fragment));
      return;
    }
    let first = true;
    for (const chunk of chunkForTts(spoken)) {
      if (deps.signal?.aborted) return;
      try {
        const { samples, sampleRate } = await deps.tts.synthesize(chunk);
        if (deps.signal?.aborted) return;
        if (!speaking) {
          speaking = true;
          ready.push(speakingEvent());
        }
        // 仅首块携带原始字幕片段，后续块留空，避免桌宠气泡/字幕重复
        ready.push(
          voiceAudioEvent(first ? fragment : '', chunk, Buffer.from(encodePcm16Wav(samples, sampleRate)).toString('base64'), sampleRate),
        );
      } catch (error) {
        console.error('[voice:bridge] 单句合成失败，降级为纯字幕：', error);
        ready.push(synthFailedEvent(first ? fragment : '', chunk));
      }
      first = false;
    }
  };

  const enqueue = (fragment: string): void => {
    chain = chain.then(() => synthFragment(fragment));
  };

  /** 排空已就绪音频帧（非阻塞；无帧时立即返回） */
  function* drain(): Generator<VoiceBridgeEvent> {
    while (ready.length > 0) yield ready.shift()!;
  }

  try {
    for await (const event of source) {
      if (deps.signal?.aborted) break;

      // 先下发已合成音频，再即时放行原始文本事件（文本语义与完成态不等语音）
      yield* drain();
      yield event;

      if (event.event === 'delta') {
        const content = event.data.content;
        // 增量/全文兼容：累计原始全文
        rawFull = content.startsWith(rawFull) ? content : rawFull + content;
        // v1.6：对累计全文做流式剥离（含半截尾块），只把新增的干净文本送切句器；
        // 清洗结果理论上单调增长，极端回退（隐藏窗口扩大）时该差分丢弃不补读
        const cleanFull = stripEmotionSignalBlock(rawFull);
        const suffix = cleanFull.startsWith(spokenFull)
          ? cleanFull.slice(spokenFull.length)
          : '';
        spokenFull += suffix;

        for (const fragment of splitter.push(suffix)) enqueue(fragment);
      }

      if (event.event === 'done' || event.event === 'error') {
        for (const fragment of splitter.flush()) enqueue(fragment);
        // 等待尾部片段合成完毕（SSE 保活；文本 done 已下发，前端已落账）
        await chain;
        yield* drain();
        if (!deps.signal?.aborted) {
          yield finalAudioEvent();
          if (speaking) {
            speaking = false;
            yield idleEvent();
          }
        }
      }
    }
  } finally {
    if (speaking && !deps.signal?.aborted) yield idleEvent();
  }
}
