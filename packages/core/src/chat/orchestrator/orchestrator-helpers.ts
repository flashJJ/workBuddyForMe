import { ApiError } from '@wbfm/shared/errors';
import { type Citation } from '@wbfm/shared/types';
import { ProviderError, type ToolCall } from '@wbfm/ai';
import { parseToolArgs } from '../../tools/tool-executor';
import type { ToolResult } from '../../tools/types';

export const ROUND_LIMIT_FALLBACK =
  '（工具调用已达轮数上限，未能形成回答，请换个问法再试一次。）';

/** RAG trace 输出的摘要片段上限 */
export const RAG_SNIPPET_LIMIT = 160;

export function normalizeFailure(error: unknown): { code: string; message: string } {
  if (error instanceof ApiError) return { code: error.code, message: error.message };
  if (error instanceof ProviderError) return { code: error.code, message: error.message };
  return { code: 'INTERNAL_ERROR', message: '对话生成失败，请稍后重试' };
}

/** v2.27：引用去重键——文档/片段/静态层/表格坐标/网页地址共同定位一条来源 */
function citationKey(c: Citation): string {
  return [
    c.documentId,
    c.ordinal,
    c.staticKind ?? 'chunk',
    c.tableNo ?? '',
    c.tableRow ?? '',
    c.sourceUrl ?? '',
  ].join('|');
}

/**
 * v2.27：citations 合并——同键保留首条并合并 snippet（取更完整者），
 * 合并后按列表顺序重编 citeIndex（从 1 连续），与资料块编号保持一致。
 */
export function mergeCitations(existing: Citation[], incoming: Citation[] | undefined): Citation[] {
  if (!incoming || incoming.length === 0) return existing;
  const merged = existing.map((citation) => ({ ...citation }));
  const seen = new Map<string, number>();
  merged.forEach((citation, index) => seen.set(citationKey(citation), index));
  for (const citation of incoming) {
    const key = citationKey(citation);
    const hit = seen.get(key);
    if (hit === undefined) {
      seen.set(key, merged.length);
      merged.push({ ...citation });
      continue;
    }
    const prev = merged[hit]!;
    if (citation.snippet && citation.snippet.length > (prev.snippet?.length ?? 0)) {
      merged[hit] = { ...prev, snippet: citation.snippet };
    }
  }
  return merged.map((citation, index) => ({ ...citation, citeIndex: index + 1 }));
}

/** 仅用于界面摘要的宽容解析，失败返回空对象 */
export function safeParseArgs(call: ToolCall): unknown {
  try {
    return parseToolArgs(call);
  } catch {
    return {};
  }
}

/** 工具调用兜底：模型幻觉出的工具名统一拒绝 */
export function unknownToolResult(name: string): ToolResult {
  return {
    ok: false,
    output: `工具「${name}」未启用或不存在。请仅使用提供的工具，或不使用工具直接回答。`,
    summary: `未知工具：${name}`,
  };
}
