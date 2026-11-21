import type { GlobalSearchHit } from '../types';

/** v4.19：复制引用只含标题与站内深链，不含正文；总长上限 300 字符 */
export const CITATION_MAX_LENGTH = 300;

/** 组装知识结果的引用文本：`标题 — /knowledge?kb=<id>` */
export function buildHitCitation(
  hit: Pick<GlobalSearchHit, 'title' | 'deepLink'>,
): string {
  return `${hit.title.trim()} — ${hit.deepLink.trim()}`.slice(0, CITATION_MAX_LENGTH);
}
