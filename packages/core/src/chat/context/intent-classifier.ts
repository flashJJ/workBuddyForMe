import { TURN_INTENT_KINDS, turnIntentSchema, type TurnIntent } from '@wbfm/shared/schemas';
import { createSettingsService } from '../../services/settings/settings-service';
import type { ServiceDeps } from '../../services/base/deps';
import { resolveChatTargetForModelId, type ResolvedChatTarget } from './model-resolver';
import type { IntentClassifier } from './turn-intent';

/**
 * v4.8 小模型意图分类器：规则低置信度时的可选兜底。
 * - 默认关闭；用户在调优中心显式开启并绑定模型后才产生额外调用；
 * - 输出严格 JSON（kind/confidence/signals），任何解析失败回退规则；
 * - 超时由 classifyTurnIntent 统一控制并 abort 请求。
 */

const MAX_INPUT_CHARS = 600;
const MAX_OUTPUT_TOKENS = 96;

const SYSTEM_PROMPT = [
  '你是对话意图分类器。只输出一个 JSON 对象，不要解释、不要代码块。',
  '格式：{"kind":"chitchat|knowledge|follow_up|tool_task|clarify|memory_write|reminder",',
  '"confidence":0到1之间的小数,"signals":["简短信号"],"suggestedTaskMode":true或false}',
  '判定要点：',
  '- chitchat：寒暄、情绪表达、无需检索或工具；',
  '- knowledge：询问事实、概念、解释、对比，通常需要资料；',
  '- follow_up：引用上一轮/前文继续追问；',
  '- tool_task：要求执行多步操作或调用工具（整理、生成、导出、修改等）；',
  '- clarify：用户表示没听懂、要求再说一遍；',
  '- memory_write：明确要求记住或忘掉某件事；',
  '- reminder：明确的提醒/闹钟请求。',
].join('\n');

/** 读取设置并解析模型；开关关闭或模型不可用时返回 null（纯规则） */
export function createIntentClassifier(deps: ServiceDeps): IntentClassifier | null {
  let target: ResolvedChatTarget;
  try {
    const settings = createSettingsService(deps).get();
    if (settings.intentClassifierEnabled !== true) return null;
    target = resolveChatTargetForModelId(deps, settings.intentClassifierModelId ?? null);
  } catch {
    return null;
  }
  return async (text, signal) => {
    let raw = '';
    const stream = target.provider.chatStream({
      model: target.model.modelId,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text.slice(0, MAX_INPUT_CHARS) },
      ],
      temperature: 0,
      maxTokens: MAX_OUTPUT_TOKENS,
      signal,
    });
    for await (const chunk of stream) raw += chunk.delta;
    return parseIntentJson(raw);
  };
}

/** 解析分类器输出：容忍代码块/前后废话；字段非法或低置信返回 null */
export function parseIntentJson(raw: string): TurnIntent | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    if (!TURN_INTENT_KINDS.includes(parsed.kind as never)) return null;
    const confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
    const signals = Array.isArray(parsed.signals)
      ? parsed.signals.filter((item): item is string => typeof item === 'string').slice(0, 8)
      : [];
    const result = turnIntentSchema.safeParse({
      kind: parsed.kind,
      confidence,
      signals: signals.length > 0 ? signals : ['small-model'],
      suggestedTaskMode: parsed.suggestedTaskMode === true,
      source: 'classifier',
    });
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
