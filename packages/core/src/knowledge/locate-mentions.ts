/**
 * 句子→分片坐标映射（v1.3 M2，纯函数）。
 *
 * 抽取器在 stitchChunks 产出的虚拟文档上工作，mention 只带虚拟字符偏移；
 * 入库前需用本模块解析出实体出现处归属的 chunk/page/paragraph：
 * - 句首所在 run 优先（句子一般不跨片）；
 * - 跨片句子按「与各 run 的相交字符数」取最大者（同分取 ordinal 较小者）；
 * - 完全落不进任何 run（偏移越界）返回 null，由调用方丢弃该 mention，
 *   绝不让脏坐标入库。
 */

import type { CharRun } from './stitch-chunks';

export interface MentionLocation {
  chunkId: number;
  ordinal: number;
  pageNo: number | null;
  paragraphNo: number | null;
}

function intersection(run: CharRun, start: number, end: number): number {
  return Math.max(0, Math.min(run.end, end) - Math.max(run.start, start));
}

/** 单条句子区间（虚拟坐标，半开）映射到归属分片坐标 */
export function locateMention(
  runs: CharRun[],
  start: number,
  end: number,
): MentionLocation | null {
  if (end <= start || runs.length === 0) return null;
  let best: CharRun | null = null;
  let bestOverlap = 0;
  for (const run of runs) {
    if (run.start >= end) break; // runs 有序，后面的不可能再相交
    const hit = intersection(run, start, end);
    if (hit > bestOverlap || (hit === bestOverlap && best && run.ordinal < best.ordinal)) {
      best = run;
      bestOverlap = hit;
    }
  }
  if (!best || bestOverlap === 0) return null;
  return {
    chunkId: best.chunkId,
    ordinal: best.ordinal,
    pageNo: best.pageNo,
    paragraphNo: best.paragraphNo,
  };
}

export interface MentionSpan {
  charStart: number;
  charEnd: number;
}

export interface LocatedMention<T extends MentionSpan> {
  spec: T;
  location: MentionLocation;
}

/**
 * 批量映射：无法定位的条目被过滤（不抛错），保证编译产物坐标全部可回指。
 */
export function locateMentions<T extends MentionSpan>(
  runs: CharRun[],
  specs: T[],
): LocatedMention<T>[] {
  const out: LocatedMention<T>[] = [];
  for (const spec of specs) {
    const location = locateMention(runs, spec.charStart, spec.charEnd);
    if (location) out.push({ spec, location });
  }
  return out;
}

export interface LocatedContext {
  context: string;
  location: MentionLocation;
}

/**
 * 原文句子 → 坐标（规则/LLM 两条通道共用）。
 * context 必须是缝合文本的逐字片段：indexOf 找不到（模型改写/幻觉）即丢弃，
 * 从根上保证入库 mention 全部可回指；重复句子取首次出现位置，按出现序去重。
 */
export function locateContexts(
  text: string,
  runs: CharRun[],
  contexts: string[],
): LocatedContext[] {
  const out: LocatedContext[] = [];
  const seen = new Set<string>();
  for (const context of contexts) {
    const trimmed = context.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    const start = text.indexOf(trimmed);
    if (start === -1) continue;
    const location = locateMention(runs, start, start + trimmed.length);
    if (location) out.push({ context: trimmed, location });
  }
  return out;
}
