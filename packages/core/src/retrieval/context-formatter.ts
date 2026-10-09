import { RAG_CHUNK_MIN_TOKENS } from '@wbfm/shared/constants';
import { type Citation } from '@wbfm/shared/types';
import type { RagChunk } from '../chat/types';
import { estimateTokens, truncateToTokens } from '../chat/context-budget';
import type { RetrievedChunk } from './retrieval-service';

export const CITATION_SNIPPET_LENGTH = 160;

/** 单个资料条目的格式化（与资料块内编号一致，从 1 开始） */
function formatChunkEntry(chunk: Pick<RagChunk, 'documentName' | 'ordinal' | 'content'>, index: number): string {
  return `[${index + 1}] 来源：《${chunk.documentName}》片段 ${chunk.ordinal + 1}\n${chunk.content}`;
}

/** 将检索片段格式化为注入系统提示词的参考资料块（带编号，供模型引用） */
export function formatContextBlock(chunks: RetrievedChunk[]): string {
  return chunks.map((chunk, index) => formatChunkEntry(chunk, index)).join('\n\n');
}

export interface FittedContextBlock {
  /** 预算内的资料块；预算不足以容纳任何片段时为空串（调用方整块省略） */
  block: string;
  /** 完整纳入的片段条数 */
  included: number;
  /** 是否有片段被截断或丢弃（可观测/提示用） */
  limited: boolean;
}

/**
 * 按 token 预算贪心装配 RAG 资料块（相关性顺序即优先级）：
 * - 整条装入，装不下即停止（后续片段相关性更低，不跳选）；
 * - 仅第一条且整条超预算时，按预算截断正文（保留下限以下宁可不注入）；
 * - 编号始终连续从 1 开始，避免模型引用悬空编号。
 */
export function fitContextBlock(chunks: RagChunk[], maxTokens: number): FittedContextBlock {
  if (maxTokens < RAG_CHUNK_MIN_TOKENS) return { block: '', included: 0, limited: chunks.length > 0 };

  const entries: string[] = [];
  let used = 0;
  let truncated = false;

  for (const chunk of chunks) {
    const separator = entries.length > 0 ? '\n\n' : '';
    let entry = formatChunkEntry(chunk, entries.length);
    let cost = estimateTokens(separator + entry);

    if (used + cost <= maxTokens) {
      entries.push(entry);
      used += cost;
      continue;
    }

    // 非首条超预算：后续片段不再尝试（保持相关性优先级与连续编号）
    if (entries.length > 0) break;

    // 首条整条放不下：截断正文到剩余预算
    const header = `[1] 来源：《${chunk.documentName}》片段 ${chunk.ordinal + 1}\n`;
    const bodyBudget = maxTokens - estimateTokens(header);
    if (bodyBudget < RAG_CHUNK_MIN_TOKENS) break;
    const clipped = truncateToTokens(chunk.content, bodyBudget);
    entry = header + clipped;
    cost = estimateTokens(entry);
    if (cost > maxTokens || estimateTokens(clipped) < RAG_CHUNK_MIN_TOKENS) break;
    entries.push(entry);
    used += cost;
    truncated = true;
    break;
  }

  return {
    block: entries.join('\n\n'),
    included: entries.length,
    limited: truncated || entries.length < chunks.length,
  };
}

/** 转为随答返回的引用信息（snippet 截断，避免 SSE 载荷过大） */
export function toCitations(chunks: RetrievedChunk[]): Citation[] {
  return chunks.map((chunk, index) => ({
    documentId: chunk.documentId,
    documentName: chunk.documentName,
    ordinal: index,
    sourceUrl: chunk.sourceUrl,
    snippet:
      chunk.content.length > CITATION_SNIPPET_LENGTH
        ? `${chunk.content.slice(0, CITATION_SNIPPET_LENGTH)}…`
        : chunk.content,
  }));
}
