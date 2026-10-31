/**
 * 表情指令标签（v1.0 M3）。
 *
 * 模型开启「表情指令」后在回复中插入 `[joy]` 等标签驱动 Live2D 表情；
 * 标签不出声（voice 包 stripForTts 全去括号）、不上屏（本模块 strip）、
 * 不进分享导出。客户端与服务端共用同一份规范/别名表，避免行为漂移。
 */

export const EXPRESSION_TAGS = [
  'neutral',
  'anger',
  'disgust',
  'fear',
  'joy',
  'sadness',
  'surprise',
  'smirk',
] as const;
export type ExpressionTag = (typeof EXPRESSION_TAGS)[number];

export const DEFAULT_EXPRESSION: ExpressionTag = 'neutral';

/** 近义词 → 规范标签（模型对提示词遵循不稳时的容错） */
const ALIASES: Record<string, ExpressionTag> = {
  neutral: 'neutral',
  normal: 'neutral',
  calm: 'neutral',
  default: 'neutral',
  anger: 'anger',
  angry: 'anger',
  mad: 'anger',
  rage: 'anger',
  annoyance: 'anger',
  disgust: 'disgust',
  disgusted: 'disgust',
  fear: 'fear',
  scared: 'fear',
  afraid: 'fear',
  terrified: 'fear',
  panic: 'fear',
  joy: 'joy',
  happy: 'joy',
  smile: 'joy',
  smiling: 'joy',
  laughing: 'joy',
  pleased: 'joy',
  glad: 'joy',
  delighted: 'joy',
  sadness: 'sadness',
  sad: 'sadness',
  cry: 'sadness',
  crying: 'sadness',
  sorrow: 'sadness',
  upset: 'sadness',
  surprise: 'surprise',
  surprised: 'surprise',
  shock: 'surprise',
  shocked: 'surprise',
  astonished: 'surprise',
  amazed: 'surprise',
  smirk: 'smirk',
  smug: 'smirk',
};

const EXPRESSION_TAG_PATTERN = /\[([a-z]{2,12})\]/gi;
const TRAILING_PARTIAL_PATTERN = /\[([a-z]{2,12})$/i;
const KNOWN_TOKENS = new Set<string>(Object.keys(ALIASES));

/** 方括号内文本 → 规范表情标签；不认识返回 null */
export function normalizeExpressionName(token: string): ExpressionTag | null {
  return ALIASES[token.trim().toLowerCase()] ?? null;
}

function isKnownPrefix(prefix: string): boolean {
  for (const token of KNOWN_TOKENS) {
    if (token.startsWith(prefix)) return true;
  }
  return false;
}

/** 从展示/导出文本中移除表情标签（含流末尾已知标签的半个前缀，防流式闪烁） */
export function stripExpressionDirectives(text: string): string {
  return text
    .replace(EXPRESSION_TAG_PATTERN, (whole, token: string) =>
      normalizeExpressionName(String(token)) ? '' : whole,
    )
    .replace(TRAILING_PARTIAL_PATTERN, (whole, token: string) =>
      isKnownPrefix(String(token).toLowerCase()) ? '' : whole,
    );
}
