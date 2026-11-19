import type { ToolCall } from '@wbfm/ai';

/**
 * 同轮可并行的联网只读工具：彼此无依赖，失败也互不阻断。
 * 模型一次返回多个检索/抓取调用时，串行会把总耗时累加成几十秒。
 */
const PARALLEL_TOOL_NAMES = new Set(['web_search', 'fetch_webpage']);

/** 与单轮抓取预算一致，避免并发瞬时把目标站点打满 */
export const PARALLEL_TOOL_LIMIT = 3;

function urlOf(call: ToolCall): string | null {
  if (call.function.name !== 'fetch_webpage') return null;
  try {
    const parsed = JSON.parse(call.function.arguments || '{}') as { url?: unknown };
    return typeof parsed.url === 'string' && parsed.url.trim() ? parsed.url.trim() : null;
  } catch {
    return null;
  }
}

/**
 * 取从 start 开始的一段可并行调用（少于 2 个返回空数组，走原串行路径）：
 * - 只含 web_search / fetch_webpage，遇到其他工具立即截止；
 * - 最多 PARALLEL_TOOL_LIMIT 个；
 * - 同一 URL 重复出现时截止：保留「连续失败后降级」所需的串行语义。
 */
export function takeParallelRun(calls: ToolCall[], start: number): ToolCall[] {
  const run: ToolCall[] = [];
  const urls = new Set<string>();
  for (let index = start; index < calls.length && run.length < PARALLEL_TOOL_LIMIT; index += 1) {
    const call = calls[index]!;
    if (!PARALLEL_TOOL_NAMES.has(call.function.name)) break;
    const url = urlOf(call);
    if (url !== null) {
      if (urls.has(url)) break;
      urls.add(url);
    }
    run.push(call);
  }
  return run.length >= 2 ? run : [];
}
