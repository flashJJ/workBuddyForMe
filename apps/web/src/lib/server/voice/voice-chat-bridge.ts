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
  tts: Pick<TtsEngine, 'synthesize'> & Partial<Pick<TtsEngine, 'synthesizeStream'>>;
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
 * 关键时序：合成在后台保序链上串行推进，**绝不阻塞文本事件**——delta/全文
 * 事件先即时下发（字幕零背压），done 文本帧同样即时下发（前端立刻落账完成态）。
 *
 * v4.19 首音优化：
 * - 引擎支持 synthesizeStream 时按增量 PCM 回传，每块立即入队并唤醒主循环
 *   下发（不再等「下一个文本事件」才排空已合成音频）；
 * - 已合成帧通过 wake 唤醒 Promise.race 即时下发，模型/工具停顿时也不积压；
 * - signal 透传到引擎，停止/新轮后旧合成在块边界退出，不再占住单 worker。
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
  /** 音频就绪唤醒：主循环阻塞在上游 next() 时也能立即排空 ready */
  let wake: (() => void) | null = null;
  const pushReady = (event: VoiceBridgeEvent): void => {
    ready.push(event);
    const resume = wake;
    wake = null;
    resume?.();
  };
  /** 保序合成链：片段按入队顺序串行合成，合成 promise 不阻塞主管线 */
  let chain: Promise<void> = Promise.resolve();

  const synthFragment = async (fragment: string): Promise<void> => {
    if (deps.signal?.aborted) return;
    const spoken = stripForTts(fragment);
    if (!spoken) {
      pushReady(silentFragmentEvent(fragment));
      return;
    }
    // 纯标点/表情块（如「：）」）chunkForTts 会全部丢弃：只出字幕，不进引擎
    const chunks = chunkForTts(spoken);
    if (chunks.length === 0) {
      pushReady(silentFragmentEvent(fragment));
      return;
    }
    let firstChunk = true;
    for (const chunk of chunks) {
      if (deps.signal?.aborted) return;
      let firstAudio = true;
      const emit = (samples: Float32Array, sampleRate: number): void => {
        if (deps.signal?.aborted || samples.length === 0) return;
        if (!speaking) {
          speaking = true;
          pushReady(speakingEvent());
        }
        // 仅本轮首块的第一个音频片段携带原始字幕，避免桌宠气泡/字幕重复
        pushReady(
          voiceAudioEvent(
            firstChunk && firstAudio ? fragment : '',
            chunk,
            Buffer.from(encodePcm16Wav(samples, sampleRate)).toString('base64'),
            sampleRate,
          ),
        );
        firstAudio = false;
      };
      try {
        if (deps.tts.synthesizeStream) {
          await deps.tts.synthesizeStream(chunk, { signal: deps.signal }, (result) => {
            emit(result.samples, result.sampleRate);
          });
        } else {
          const result = await deps.tts.synthesize(chunk);
          emit(result.samples, result.sampleRate);
        }
      } catch (error) {
        if (!deps.signal?.aborted) {
          console.error('[voice:bridge] 单句合成失败，降级为纯字幕：', error);
          pushReady(synthFailedEvent(firstChunk ? fragment : '', chunk));
        }
      }
      firstChunk = false;
    }
  };

  const enqueue = (fragment: string): void => {
    chain = chain.then(() => synthFragment(fragment));
  };

  /** 排空已就绪音频帧（非阻塞；无帧时立即返回） */
  function* drain(): Generator<VoiceBridgeEvent> {
    while (ready.length > 0) yield ready.shift()!;
  }

  const iterator = source[Symbol.asyncIterator]();
  let nextPromise: Promise<IteratorResult<OrchestratorEvent>> | null = null;
  try {
    nextPromise = iterator.next();
    for (;;) {
      // 上一轮 yield/文本处理期间可能已有音频就绪：先排空再进入等待，
      // 否则 wake 在无等待者的窗口里被丢弃，帧会一直压到下一个上游事件。
      if (ready.length > 0) yield* drain();
      // 上游事件与音频就绪二选一：先到先发，音频不再等下一个文本事件
      const eventPromise = nextPromise.then(
        (result) => ({ kind: 'event' as const, result }),
        (error: unknown) => ({ kind: 'error' as const, error }),
      );
      const winner = await Promise.race([
        eventPromise,
        new Promise<{ kind: 'wake' }>((resolve) => {
          wake = () => resolve({ kind: 'wake' });
        }),
      ]);
      if (winner.kind === 'wake') {
        yield* drain();
        continue;
      }
      wake = null;
      if (winner.kind === 'error') throw winner.error;
      const { done, value } = winner.result;
      if (done) break;
      if (deps.signal?.aborted) break;

      // 先下发已合成音频，再即时放行原始文本事件（文本语义与完成态不等语音）
      yield* drain();
      yield value;

      if (value.event === 'delta') {
        const content = value.data.content;
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

      if (value.event === 'done' || value.event === 'error') {
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
      nextPromise = iterator.next();
    }
  } finally {
    // 上游在 abort 后可能以 rejection 收尾：挂上消费端避免 unhandled rejection
    if (nextPromise) void nextPromise.catch(() => undefined);
    if (speaking && !deps.signal?.aborted) yield idleEvent();
  }
}
