import { DEFAULT_CONTEXT_TOKEN_BUDGET } from '@wbfm/shared/constants';

/** 生效窗口上限：防止模型记录被误填成天文数字后一次性发出天价请求 */
export const HARNESS_MAX_CONTEXT_WINDOW = 1_000_000;

/**
 * 厂商提示表：OpenAI 兼容协议的 /models 不返回上下文长度，
 * 这里按 modelId 给保守估值；最终以溢出重试与用户手填为准。
 */
const MODEL_HINTS: ReadonlyArray<{ pattern: RegExp; window: number }> = [
  { pattern: /deepseek/i, window: 128_000 },
  { pattern: /claude/i, window: 200_000 },
  { pattern: /gemini/i, window: 1_000_000 },
  { pattern: /qwen|qwq|qwen2/i, window: 131_072 },
  { pattern: /kimi|moonshot/i, window: 131_072 },
  { pattern: /glm-4/i, window: 128_000 },
  { pattern: /gpt-4\.1|gpt-4o|gpt-4-turbo|^o[134]/i, window: 128_000 },
];

export type ContextWindowSource = 'declared' | 'hint' | 'default';

export interface EffectiveContextWindow {
  /** 模型记录里的显式值（未配置为 null） */
  declared: number | null;
  effective: number;
  source: ContextWindowSource;
}

/**
 * v4.11 生效上下文窗口：显式配置 > 厂商提示表 > 保守默认。
 * 返回值统一受 HARNESS_MAX_CONTEXT_WINDOW 上限约束。
 */
export function resolveEffectiveContextWindow(model: {
  modelId: string;
  contextWindow?: number | null;
}): EffectiveContextWindow {
  const declared =
    typeof model.contextWindow === 'number' && model.contextWindow > 0
      ? model.contextWindow
      : null;
  if (declared !== null) {
    return {
      declared,
      effective: Math.min(declared, HARNESS_MAX_CONTEXT_WINDOW),
      source: 'declared',
    };
  }
  const hint = MODEL_HINTS.find((item) => item.pattern.test(model.modelId));
  if (hint) return { declared: null, effective: hint.window, source: 'hint' };
  return {
    declared: null,
    effective: Math.min(DEFAULT_CONTEXT_TOKEN_BUDGET, HARNESS_MAX_CONTEXT_WINDOW),
    source: 'default',
  };
}
