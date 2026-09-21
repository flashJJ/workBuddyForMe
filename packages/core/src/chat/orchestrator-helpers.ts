import { ApiError, TOOL_NAMES, type Citation, type ToolName } from '@wbfm/shared';
import { ProviderError, type ToolCall } from '@wbfm/ai';
import { parseToolArgs } from '../tools/tool-executor';

export const ROUND_LIMIT_FALLBACK =
  '（工具调用已达轮数上限，未能形成回答，请换个问法再试一次。）';

/** RAG trace 输出的摘要片段上限 */
export const RAG_SNIPPET_LIMIT = 160;

export function normalizeFailure(error: unknown): { code: string; message: string } {
  if (error instanceof ApiError) return { code: error.code, message: error.message };
  if (error instanceof ProviderError) return { code: error.code, message: error.message };
  return { code: 'INTERNAL_ERROR', message: '对话生成失败，请稍后重试' };
}

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

/** citations 按 documentId:ordinal 去重合并 */
export function mergeCitations(existing: Citation[], incoming: Citation[] | undefined): Citation[] {
  if (!incoming || incoming.length === 0) return existing;
  const seen = new Set(existing.map((c) => `${c.documentId}:${c.ordinal}`));
  const merged = [...existing];
  for (const citation of incoming) {
    const key = `${citation.documentId}:${citation.ordinal}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(citation);
    }
  }
  return merged;
}

/** 仅用于界面摘要的宽容解析，失败返回空对象 */
export function safeParseArgs(call: ToolCall): unknown {
  try {
    return parseToolArgs(call);
  } catch {
    return {};
  }
}
