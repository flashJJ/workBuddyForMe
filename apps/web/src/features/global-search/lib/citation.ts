import type { GlobalSearchHit } from '../types';

/** v4.19：复制引用只含标题与站内深链，不含正文；总长上限 300 字符 */
export const CITATION_MAX_LENGTH = 300;

/** 组装知识结果的引用文本：`标题 — /knowledge?kb=<id>` */
export function buildHitCitation(
  hit: Pick<GlobalSearchHit, 'title' | 'deepLink'>,
): string {
  return `${hit.title.trim()} — ${hit.deepLink.trim()}`.slice(0, CITATION_MAX_LENGTH);
}

/** v4.20：知识「新建任务」草稿只含标题与深链，不含正文；总长上限 500 字符 */
export const TASK_DRAFT_MAX_LENGTH = 500;

/** 组装任务页预填草稿：`请基于文档《标题》继续处理：<深链>` */
export function buildHitTaskDraft(hit: Pick<GlobalSearchHit, 'title' | 'deepLink'>): string {
  return `请基于文档《${hit.title.trim()}》继续处理：${hit.deepLink.trim()}`.slice(
    0,
    TASK_DRAFT_MAX_LENGTH,
  );
}

/** 任务页深链：`/tasks?draft=<encodeURIComponent(草稿)>` */
export function buildHitTaskHref(hit: Pick<GlobalSearchHit, 'title' | 'deepLink'>): string {
  return `/tasks?draft=${encodeURIComponent(buildHitTaskDraft(hit))}`;
}
