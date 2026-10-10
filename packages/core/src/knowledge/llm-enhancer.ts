/**
 * 可选 LLM 知识增强通道（v1.3 M2/T2.6，默认关闭）。
 *
 * 安全契约：
 * - 只允许模型「挑选/引用」原文片段——tldr/bullets/entity.context 必须是
 *   缝合文本的逐字子串（indexOf 校验），任何改写/幻觉一律丢弃；
 * - keyTerms 沿用规则通道机械产物（不信任模型造词）；
 * - JSON 解析失败、超时、空结果、零有效产物时返回 null，编译器整体降级规则；
 * - 输入/输出有硬预算（字符/ token / 超时），复用本地已配置的对话模型。
 */

import { resolveChatTargetForModelId } from '../chat/model-resolver';
import type { ServiceDeps } from '../services/deps';
import { normalizeEntityName } from './entity-extractor';
import type { CompiledSeed, KnowledgeEnhancer, KnowledgeEntitySeed } from './knowledge-compiler';

const VALID_KINDS = new Set(['concept', 'person', 'org', 'product', 'number', 'other']);
const DEFAULT_MAX_INPUT_CHARS = 12_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1200;
const DEFAULT_TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = [
  '你是本地知识库的文档抽取器。严格只输出一个 JSON 对象，不要 Markdown 代码块，不要任何解释。',
  '结构：{"tldr": string, "bullets": string[], "entities": [{name,kind,aliases,context}]}。',
  'tldr：原文中信息量最大的一句话；bullets：最多 3 个要点句；',
  'entities：最多 15 个，kind 仅可取 concept/person/org/product/number/other，',
  'aliases 为原文出现的别名数组，context 为包含该实体的原文原句（1-3 条）。',
  '硬约束：所有字符串必须逐字复制自用户文档，禁止改写、拼接、翻译或生成；',
  '拿不准的内容一律省略。',
].join('\n');

export interface LlmEnhancerOptions {
  /** 指定对话模型；null/缺省跟随全局默认对话模型 */
  modelId?: string | null;
  maxInputChars?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** 截取到预算长度并尽量回退到句末标点，避免把原句切到一半 */
function clipInput(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const window = text.slice(0, maxChars);
  const lastStop = Math.max(window.lastIndexOf('。'), window.lastIndexOf('\n'));
  return lastStop > maxChars * 0.6 ? window.slice(0, lastStop + 1) : window;
}

/** 去除可能的 ```json 包裹并截取首个 JSON 对象区间 */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/\{[\s\S]*\}/);
  const candidate = fenced ? fenced[0] : raw.trim();
  return JSON.parse(candidate);
}

/**
 * 纯函数：校验模型输出并逐字回指原文。无效字段丢弃；
 * 完全无有效增强（tldr/bullets 全回退且零实体）时返回 null。
 */
export function validateLlmSeed(
  raw: unknown,
  sourceText: string,
  fallback: CompiledSeed,
  modelId: string,
): CompiledSeed | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const verbatim = (value: unknown, min: number, max: number): string | null => {
    if (!isString(value)) return null;
    const trimmed = value.trim();
    if (trimmed.length < min || trimmed.length > max) return null;
    return sourceText.includes(trimmed) ? trimmed : null;
  };

  const tldr = verbatim(obj.tldr, 4, 240) ?? fallback.tldr;

  const bullets: string[] = [];
  if (Array.isArray(obj.bullets)) {
    for (const item of obj.bullets) {
      const sentence = verbatim(item, 4, 400);
      if (sentence && !bullets.includes(sentence)) bullets.push(sentence);
      if (bullets.length >= 3) break;
    }
  }
  if (bullets.length === 0) bullets.push(...fallback.bullets);

  const entities: KnowledgeEntitySeed[] = [];
  if (Array.isArray(obj.entities)) {
    const byNormalized = new Map<string, KnowledgeEntitySeed>();
    for (const item of obj.entities.slice(0, 15)) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const name = verbatim(record.name, 2, 60);
      if (!name) continue;
      const normalizedName = normalizeEntityName(name);
      if (!normalizedName) continue;

      const contexts: string[] = [];
      if (Array.isArray(record.context)) {
        for (const ctx of record.context) {
          const sentence = verbatim(ctx, 4, 500);
          if (sentence && !contexts.includes(sentence)) contexts.push(sentence);
          if (contexts.length >= 3) break;
        }
      }
      if (contexts.length === 0) continue;

      const aliases = Array.isArray(record.aliases)
        ? record.aliases
            .filter(isString)
            .map((a) => a.trim())
            .filter((a) => a.length >= 2 && a.length <= 60 && sourceText.includes(a) && a !== name)
        : [];

      const kind = isString(record.kind) && VALID_KINDS.has(record.kind) ? record.kind : 'concept';
      const existing = byNormalized.get(normalizedName);
      if (existing) {
        for (const alias of aliases) if (!existing.aliases.includes(alias)) existing.aliases.push(alias);
        for (const ctx of contexts) if (!existing.contexts.includes(ctx)) existing.contexts.push(ctx);
      } else {
        byNormalized.set(normalizedName, { name, normalizedName, kind, aliases, contexts });
      }
    }
    entities.push(...byNormalized.values());
  }

  const tldrUnchanged = tldr === fallback.tldr;
  const bulletsUnchanged = bullets.length === fallback.bullets.length &&
    bullets.every((b, i) => b === fallback.bullets[i]);
  if (tldrUnchanged && bulletsUnchanged && entities.length === 0) return null;

  return {
    tldr,
    bullets,
    keyTerms: fallback.keyTerms,
    extractor: 'llm',
    modelId,
    entities,
  };
}

function composeSignal(parent: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  cancel: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('LLM 增强超时')), timeoutMs);
  if (parent) parent.addEventListener('abort', () => controller.abort(parent.reason), { once: true });
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

/** 构造 LLM 增强器（注入编译器；未配置对话模型时调用返回 null，不抛给编译主流程） */
export function createLlmKnowledgeEnhancer(
  deps: ServiceDeps,
  options: LlmEnhancerOptions = {},
): KnowledgeEnhancer {
  const maxInputChars = options.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS;
  const maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async ({ stitchedText, rule, signal }) => {
    let target;
    try {
      target = resolveChatTargetForModelId(deps, options.modelId ?? null);
    } catch {
      return null;
    }

    const { signal: timedSignal, cancel } = composeSignal(signal, timeoutMs);
    try {
      let content = '';
      const stream = target.provider.chatStream({
        model: target.model.modelId,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: clipInput(stitchedText, maxInputChars) },
        ],
        temperature: 0.2,
        maxTokens: maxOutputTokens,
        signal: timedSignal,
      });
      for await (const chunk of stream) content += chunk.delta;
      if (!content.trim()) return null;
      return validateLlmSeed(extractJson(content), stitchedText, rule, target.model.modelId);
    } catch {
      return null;
    } finally {
      cancel();
    }
  };
}
