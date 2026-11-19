import { INTENT_LOW_CONFIDENCE } from '@wbfm/shared/constants';
import type { TurnIntent } from '@wbfm/shared/schemas';
import {
  detectTurnIntent,
  extractMemoryCommand,
  type MemoryCommand,
  type TurnIntentInput,
} from '@wbfm/shared/schemas';

/**
 * v4.8 规则意图识别包装（v4.12 规则纯函数下沉 @wbfm/shared/schemas，
 * 供 Web 发送前任务模式建议复用；本文件只保留异步分类器兜底）。
 * 兼容旧导入：detectTurnIntent / extractMemoryCommand 继续从这里 re-export。
 */
export { detectTurnIntent, extractMemoryCommand };
export type { MemoryCommand, TurnIntentInput };

/** 可插拔小模型分类器端口（未配置时调用方不传，纯规则零成本） */
export type IntentClassifier = (text: string, signal?: AbortSignal) => Promise<TurnIntent | null>;

/**
 * 异步识别：规则置信度足够时不再调用分类器；否则在超时内取分类器结果。
 * 分类器异常/超时/空结果一律回退规则结果，不影响主链路。
 */
export async function classifyTurnIntent(
  input: TurnIntentInput,
  classifier: IntentClassifier | null | undefined,
  timeoutMs: number,
): Promise<TurnIntent> {
  const ruled = detectTurnIntent(input);
  if (!classifier || ruled.confidence >= INTENT_LOW_CONFIDENCE) return ruled;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, timeoutMs);
    });
    const classified = await Promise.race([classifier(input.text, controller.signal), timeout]);
    if (!classified || classified.confidence < INTENT_LOW_CONFIDENCE) return ruled;
    return { ...classified, source: 'classifier' };
  } catch {
    return ruled;
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}
