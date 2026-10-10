/**
 * 无模型摘要/关键词抽取（v1.3 M2，纯函数、确定性、零网络调用）。
 *
 * 设计原则：
 * - 只从原文「挑句子/短语」，绝不生成新句子（bullets 必须可回指原文）；
 * - 高召回低精度倾向用于「候选」，注入上下文前还有检索路由的高置信门槛；
 * - 同输入恒等输出（无随机、无时间依赖），便于快照测试。
 * 实体抽取见 entity-extractor.ts。
 */

import { hasDefinitionSignal, isTitleLike, splitSentences } from './text-units';
import { MODEL_PATTERN } from './entity-extractor';

// ───────────────────────── 摘要 ─────────────────────────

export interface RuleSummary {
  /** 一句话摘要：首个有实质内容的句子原文 */
  tldr: string;
  /** 要点原句（带分），按规则分取前 N */
  bullets: string[];
  /** 文档级关键词/术语 */
  keyTerms: string[];
}

const MIN_SUBSTANTIVE = 12;
const MAX_BULLETS = 3;
const MAX_TLDR = 120;

/**
 * 型号检测专用正则（不带 g）：MODEL_PATTERN 带 /g 供 matchAll 复用，
 * 其 lastIndex 会被 .test() 推进导致跨调用结果抖动，这里必须用无状态副本。
 */
const MODEL_TEST_PATTERN = new RegExp(MODEL_PATTERN.source);

/** 句子信息分（越高越值得作为要点）：数字/型号、定义动词、专名引号、长度适中 */
function scoreSentence(sentence: string): number {
  let score = 0;
  if (hasDefinitionSignal(sentence)) score += 3;
  if (/\d/.test(sentence)) score += 1;
  if (/[「」『』""''()]/.test(sentence)) score += 1;
  if (MODEL_TEST_PATTERN.test(sentence)) score += 2;
  // 长度奖励：过短信息量低，过长多为铺陈
  const len = sentence.length;
  if (len >= 15 && len <= 120) score += 2;
  else if (len > 200) score -= 1;
  return score;
}

/**
 * 规则摘要：
 * - tldr：跳过标题/过短句后的第一个实质句（截断到 MAX_TLDR）；
 * - bullets：信息分最高的前 3 个原句（同分按出现顺序，保持阅读逻辑）。
 */
export function extractRuleSummary(text: string): RuleSummary {
  const sentences = splitSentences(text).filter((s) => !isTitleLike(s.text));
  const substantive = sentences.filter((s) => s.text.length >= MIN_SUBSTANTIVE);
  const source = substantive.length > 0 ? substantive : sentences;

  const tldrSource = source[0]?.text ?? '';
  const tldr =
    tldrSource.length > MAX_TLDR ? `${tldrSource.slice(0, MAX_TLDR).trimEnd()}…` : tldrSource;

  const ranked = source
    .map((s) => ({ span: s, score: scoreSentence(s.text) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.span.start - b.span.start);

  const bullets: string[] = [];
  for (const item of ranked) {
    if (bullets.length >= MAX_BULLETS) break;
    if (!bullets.includes(item.span.text)) bullets.push(item.span.text);
  }

  const keyTerms = extractKeyTerms(text);
  return { tldr, bullets, keyTerms };
}

// ───────────────────────── 关键词 ─────────────────────────

const STOPWORD_CHARS = new Set(['的', '了', '是', '在', '和', '与', '及', '或', '为', '对']);

/**
 * 关键词候选：型号/编号整词 + 引号短语 + 高频二字/三字中文串（简单邻接频次，
 * 不做分词）。结果去重、按（是否型号、频次、长度）排序，取前 N。
 */
export function extractKeyTerms(text: string, limit = 12): string[] {
  const scores = new Map<string, number>();
  const bump = (term: string, weight: number) => {
    const key = term.trim();
    if (!key || STOPWORD_CHARS.has(key)) return;
    scores.set(key, (scores.get(key) ?? 0) + weight);
  };

  for (const m of text.matchAll(MODEL_PATTERN)) bump(m[0]!, 5);
  for (const m of text.matchAll(/[「『"']([^」』"']{2,30})[」』"']/g)) bump(m[1]!, 4);

  // 中文二字/三字邻接串频次（滑动窗口），过滤停用字窗口
  const cjkRuns = text.match(/[一-鿿]{4,}/g) ?? [];
  const bigramCount = new Map<string, number>();
  for (const run of cjkRuns) {
    for (let i = 0; i < run.length - 1; i += 1) {
      const bi = run.slice(i, i + 2);
      if (STOPWORD_CHARS.has(bi[0]!) || STOPWORD_CHARS.has(bi[1]!)) continue;
      bigramCount.set(bi, (bigramCount.get(bi) ?? 0) + 1);
    }
  }
  for (const [bi, count] of bigramCount) {
    if (count >= 2) bump(bi, count);
  }

  return [...scores.entries()]
    .sort(
      (a, b) =>
        b[1] - a[1] ||
        b[0].length - a[0].length ||
        a[0].localeCompare(b[0], 'zh'),
    )
    .slice(0, limit)
    .map(([term]) => term);
}
