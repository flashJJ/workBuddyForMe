/**
 * v1.6 弱模型规则保底：模型未按协议输出尾块时，用保守的中文短模式判定
 * soulEvent。设计原则（对齐 M0 契约 §4）：
 * - 宁漏勿伤：只识别显式、短的情感表达；反讽/玩笑/长句/问句一律不判定，回落 chat；
 * - 纯本地规则，零额外模型调用；
 * - 关键词命中前 2 字内有否定词（不/没/别/無）则跳过。
 */
import type { SoulEventType } from '@wbfm/shared/schemas';

/**
 * 仅判定短消息：真实的显式感叹/夸奖通常 ≤20 字；放宽到 24 容纳少量标点。
 * 长句语义复杂（反讽/转折），规则主动放弃。
 */
const MAX_TEXT_LENGTH = 24;

const PRAISE_PATTERNS = [
  '你真棒', '真棒', '好棒', '太棒', '棒极了',
  '真厉害', '好厉害', '太厉害', '厉害啦',
  '真聪明', '好聪明', '太聪明',
  '干得漂亮', '做得好', '干得好', '做得漂亮', '好样的',
  '好可爱', '真可爱', '太可爱',
  '爱你', '喜欢你', '你最好', '真好', '太好了',
  '谢谢', '感谢', '辛苦啦', '辛苦了',
];

const BELITTLE_PATTERNS = [
  '真笨', '好笨', '太笨', '笨死', '笨蛋',
  '蠢货', '愚蠢', '真蠢', '好蠢',
  '真没用', '没用的', '没用',
  '废物', '垃圾', '白痴',
  '讨厌你', '很讨厌', '好讨厌', '恨你',
  '失望', '失望透顶',
  '太差劲', '差劲', '不行啊你', '滚蛋',
];

const NEGATIONS = ['不', '没', '别', '無', '无'];
const QUESTION_MARKS = ['?', '？'];
const QUESTION_SUFFIXES = ['吗', '呢'];

function containsWithoutNegation(text: string, pattern: string): boolean {
  const index = text.indexOf(pattern);
  if (index < 0) return false;
  const windowStart = Math.max(0, index - 2);
  return !NEGATIONS.some((neg) => text.slice(windowStart, index).includes(neg));
}

function looksLikeQuestion(text: string): boolean {
  if (QUESTION_MARKS.some((mark) => text.includes(mark))) return true;
  const tail = text.slice(-3);
  return QUESTION_SUFFIXES.some((suffix) => tail.endsWith(suffix));
}

/**
 * 从用户文本推断 soulEvent；不确定一律返回 null（调用方回落 chat）。
 */
export function inferSoulEventFromUserText(raw: string): SoulEventType | null {
  const text = raw.trim();
  if (!text || text.length > MAX_TEXT_LENGTH) return null;
  // 问句（在吗/对吗/这呢）语义不确定，不做情感判定
  if (looksLikeQuestion(text)) return null;

  // belittle 优先于 praise（同句既贬又夸时以负向为准，避免误加亲密度）
  if (BELITTLE_PATTERNS.some((pattern) => containsWithoutNegation(text, pattern))) {
    return 'belittle';
  }
  if (PRAISE_PATTERNS.some((pattern) => containsWithoutNegation(text, pattern))) {
    return 'praise';
  }
  return null;
}
