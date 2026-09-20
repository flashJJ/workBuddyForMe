import type { Citation } from '@wbfm/shared';
import type { RetrievedChunk } from './retrieval-service';

export const CITATION_SNIPPET_LENGTH = 160;

/** 将检索片段格式化为注入系统提示词的参考资料块（带编号，供模型引用） */
export function formatContextBlock(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (chunk, index) =>
        `[${index + 1}] 来源：《${chunk.documentName}》片段 ${chunk.ordinal + 1}\n${chunk.content}`,
    )
    .join('\n\n');
}

/** 转为随答返回的引用信息（snippet 截断，避免 SSE 载荷过大） */
export function toCitations(chunks: RetrievedChunk[]): Citation[] {
  return chunks.map((chunk, index) => ({
    documentId: chunk.documentId,
    documentName: chunk.documentName,
    ordinal: index,
    snippet:
      chunk.content.length > CITATION_SNIPPET_LENGTH
        ? `${chunk.content.slice(0, CITATION_SNIPPET_LENGTH)}…`
        : chunk.content,
  }));
}
