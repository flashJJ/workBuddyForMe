/**
 * v1.6 单回合情绪解析：把「助手完整回复 + 用户本轮文本」收敛为
 * （剥离后的正文, 情绪信号, 来源）。
 *
 * 回落链（M0 契约 §4，永不抛错、永不阻塞主回复）：
 *   1. 尾块存在且可解析 → model（逐叶 catch，词表外也给默认值）；
 *   2. 无有效尾块 → 规则保底（显式夸赞/贬损短模式）→ rule；
 *   3. 都不命中 → 默认 {neutral, 默认强度, chat}。
 */
import { DEFAULT_EMOTION_INTENSITY } from '@wbfm/shared/constants';
import {
  extractEmotionSignal,
  type EmotionSignal,
  type SoulEventType,
} from '@wbfm/shared/schemas';
import { inferSoulEventFromUserText } from './emotion-rule-guard';
import type { RecordEmotionInput } from './emotion-service';

export type ResolvedEmotionSource = 'model' | 'rule' | 'default';

export interface ResolvedTurnEmotion {
  /** 已剥离情绪尾块的正文（用于落库/气泡/TTS） */
  content: string;
  signal: EmotionSignal;
  source: ResolvedEmotionSource;
}

function fallbackSignal(soulEvent: SoulEventType): EmotionSignal {
  return { emotion: 'neutral', intensity: DEFAULT_EMOTION_INTENSITY, soulEvent };
}

export function resolveTurnEmotion(
  assistantContent: string,
  userContent: string,
): ResolvedTurnEmotion {
  const extracted = extractEmotionSignal(assistantContent);
  if (extracted) {
    return { content: extracted.cleaned, signal: extracted.signal, source: 'model' };
  }
  const ruled = inferSoulEventFromUserText(userContent);
  if (ruled) {
    // 规则命中只决定 soulEvent；本轮表情不做猜测，保持 neutral（脸由基线情绪表达）
    return { content: assistantContent.trimEnd(), signal: fallbackSignal(ruled), source: 'rule' };
  }
  return {
    content: assistantContent.trimEnd(),
    signal: fallbackSignal('chat'),
    source: 'default',
  };
}

type TurnEmotionRecord = (
  assistantId: string,
  input: RecordEmotionInput,
  now?: number,
) => unknown;

export interface RecordTurnEmotionParams {
  /** 情绪开关关闭时直接返回 null，正文保持原样 */
  enabled: boolean;
  rawContent: string;
  userContent: string;
  assistantId: string;
  messageId: string;
  record: TurnEmotionRecord;
  now?: number;
}

export interface RecordedTurnEmotion {
  /** 已剥离情绪尾块的正文 */
  content: string;
  signal: EmotionSignal;
}

/**
 * v1.6 M4：成功回合的情绪一体化落库——尾块剥离/规则保底/写状态与流水。
 * 任何异常只告警并返回 null（情绪永不阻断已完成的正文）；
 * 返回 null 时调用方必须保留原始正文与 undefined 信号。
 */
export function recordTurnEmotion(params: RecordTurnEmotionParams): RecordedTurnEmotion | null {
  if (!params.enabled) return null;
  try {
    const resolved = resolveTurnEmotion(params.rawContent, params.userContent);
    params.record(
      params.assistantId,
      {
        type: resolved.signal.soulEvent,
        source: resolved.source,
        emotion: resolved.signal.emotion,
        intensity: resolved.signal.intensity,
        messageId: params.messageId,
      },
      params.now ?? Date.now(),
    );
    return { content: resolved.content, signal: resolved.signal };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      `[wbfm] 情绪回合处理失败，已降级为普通回复：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}
