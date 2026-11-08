import type { ChatMessage } from '@wbfm/ai';
import type { DatabaseInstance } from '@wbfm/database';
import type { SecretCipher } from '../../secrets/cipher';
import { resolveChatTargetForModelId, type ResolvedChatTarget } from './model-resolver';

/**
 * v2.25：按住说话（PTT）识别结果的模型润色。
 * 只做同音纠错、补标点/断句、数字与专名规范化，不增删信息、不改语义。
 * 无模型 / 超时 / 输出不合格一律回退原文，绝不阻塞用户发送。
 */

const POLISH_SYSTEM_INSTRUCTION = [
  '你是语音识别文本的整理助手。用户会给你一段语音识别结果，请只做以下处理：',
  '1. 修正明显的同音字/错别字；',
  '2. 补全标点、合理断句；',
  '3. 规范数字、日期、专有名词的写法。',
  '硬性要求：',
  '- 不得增删信息，不得改变语气与语义，不得翻译、扩写、总结或回答问题；',
  '- 保留口语表达，不要改写成书面语；',
  '- 无法确定的地方保持原样；',
  '- 只输出整理后的纯文本，不要解释、不要代码块、不要引号包裹。',
].join('\n');

const DEFAULT_TIMEOUT_MS = 8_000;
/** 输出超过原文 3 倍视为模型跑题 */
const MAX_OUTPUT_RATIO = 3;

export function buildVoicePolishMessages(text: string): ChatMessage[] {
  return [
    { role: 'system', content: POLISH_SYSTEM_INSTRUCTION },
    { role: 'user', content: text },
  ];
}

/** 清洗模型输出；空、跑题（超原文 3 倍）返回 null 表示放弃润色 */
export function sanitizePolishedText(original: string, raw: string): string | null {
  let text = raw.trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith('“') && text.endsWith('”'))
  ) {
    text = text.slice(1, -1).trim();
  }
  if (!text) return null;
  if (text === original) return text;
  if (text.length > original.length * MAX_OUTPUT_RATIO) return null;
  return text;
}

/** 用已解析的对话模型做一次非流式润色；失败抛出由上层降级 */
export async function polishWithTarget(
  target: ResolvedChatTarget,
  text: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const stream = target.provider.chatStream({
    model: target.model.modelId,
    messages: buildVoicePolishMessages(text),
    temperature: 0,
    maxTokens: 1024,
    ...(signal ? { signal } : {}),
  });
  let raw = '';
  for await (const chunk of stream) raw += chunk.delta;
  return sanitizePolishedText(text, raw);
}

export interface PolishVoiceTextInput {
  db: DatabaseInstance;
  cipher: SecretCipher;
  text: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface PolishVoiceTextResult {
  text: string;
  /** false=沿用原文（无默认模型、超时、异常、输出不合格） */
  polished: boolean;
}

/** 入口：解析全局默认对话模型并润色；任何失败都静默回退原文 */
export async function polishVoiceText(
  input: PolishVoiceTextInput,
): Promise<PolishVoiceTextResult> {
  const original = input.text.trim();
  if (!original) return { text: input.text, polished: false };

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  input.signal?.addEventListener('abort', onAbort);
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const target = resolveChatTargetForModelId({ db: input.db, cipher: input.cipher }, null);
    const polished = await polishWithTarget(target, original, controller.signal);
    if (!polished) return { text: original, polished: false };
    return { text: polished, polished: polished !== original };
  } catch {
    return { text: original, polished: false };
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', onAbort);
  }
}
