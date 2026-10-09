import { estimateTokens, truncateToTokens } from '../chat/context-budget';
import { compactJsonStructure } from './compact-json';
import type { ToolResult } from './types';

/**
 * 工具结果中央压缩层（v1.1 M1，docs/plan/v1.1/02 §2）：
 * 完整 ToolResult 照常进 tool trace / SSE / UI；本模块只产出「入模视图」——
 * 回灌下一轮 LLM messages 的 tool content。压缩器纯函数、预算由装配层下发，
 * 不读全局状态、不改写 summary/output 原字段。
 */

export type CompactSource = 'builtin' | 'mcp' | 'flow' | 'computer';

export interface CompactOptions {
  /** 本条工具消息允许占用的 token 预算（context-budget 装配时下发） */
  maxTokens: number;
  /** 工具来源，决定特化策略 */
  source: CompactSource;
  /** 工具全名（knowledge_search/fetch_webpage/计算机工具据此特化） */
  toolName: string;
}

export type CompactStrategy =
  | 'passthrough'
  | 'knowledge'
  | 'json-sampled'
  | 'identity'
  | 'webpage'
  | 'text';

export interface CompactOutcome {
  /** 入模视图文本 */
  text: string;
  /** 是否实际发生压缩（供 trace 标 compacted） */
  compacted: boolean;
  strategy: CompactStrategy;
  originalTokens: number;
  tokens: number;
}

const KNOWLEDGE_TOOL = 'knowledge_search';
const WEBPAGE_TOOL = 'fetch_webpage';
/** knowledge_search 特化摘录长度（字符；编号/文档名始终完整保留） */
const KNOWLEDGE_EXCERPT_CHARS = 120;
const TRUNCATE_HINT = '（内容已按预算截断；完整结果见工具记录，可用具体 id 再查询）';
/** 计算机工具名前缀：文本短、图片走多模态通道，不压缩 */
const COMPUTER_TOOL_RE = /^(?:screen_snapshot|mouse_|keyboard_|window_|uia_|app_launch)/;

const FRAGMENT_HEADER_RE = /^\[(\d+)\]\s*来源：《([\s\S]*?)》片段\s*(\d+)\s*\n([\s\S]*)$/;

interface KnowledgeFragment {
  ordinal: string;
  name: string;
  fragmentNo: string;
  body: string;
}

/** ToolRuntime 的 source（'builtin' | 'flow' | `mcp:<server>`）归一到四类策略源 */
export function normalizeToolSource(source: string | undefined): CompactSource {
  if (source === 'flow') return 'flow';
  if (source === 'computer') return 'computer';
  if (source?.startsWith('mcp:')) return 'mcp';
  return 'builtin';
}

function parseKnowledgeBlock(output: string): KnowledgeFragment[] | null {
  const parts = output.split(/\n\n(?=\[\d+\])/);
  if (parts.length < 2) return null;
  const fragments = parts.map((part) => {
    const m = FRAGMENT_HEADER_RE.exec(part.trim());
    if (!m) return null;
    return { ordinal: m[1]!, name: m[2]!, fragmentNo: m[3]!, body: m[4]! };
  });
  return fragments.every((f): f is KnowledgeFragment => f !== null) ? fragments : null;
}

/**
 * knowledge_search 特化：编号（引用句柄）一个不丢。
 * 先全条目「编号+文档名+120 字摘录」按预算贪心；仍超预算则降级为纯编号行。
 */
function compactKnowledge(fragments: KnowledgeFragment[], maxTokens: number): CompactOutcome | null {
  const originalText = fragments.map((f) => `[${f.ordinal}] ${f.body}`).join('\n\n');
  const shortLine = (f: KnowledgeFragment): string => {
    const excerpt =
      f.body.length > KNOWLEDGE_EXCERPT_CHARS
        ? `${f.body.slice(0, KNOWLEDGE_EXCERPT_CHARS - 1)}…`
        : f.body;
    return `[${f.ordinal}] 《${f.name}》片段${f.fragmentNo}：${excerpt}`;
  };
  const idLine = (f: KnowledgeFragment): string =>
    `[${f.ordinal}] 《${f.name}》片段${f.fragmentNo}`;

  /** 编号（引用句柄）必须全保留：贪心装 shortLine（整串精测，避免分段取整误差）；
   *  缺任一编号则整体退 idLine；仍放不下交调用方走文本兜底 */
  const assemble = (): string | null => {
    const lines: string[] = [];
    for (const f of fragments) {
      const candidate = [...lines, shortLine(f)].join('\n');
      if (estimateTokens(candidate) > maxTokens) break;
      lines.push(shortLine(f));
    }
    if (lines.length === fragments.length) return lines.join('\n');

    const idText = fragments.map(idLine).join('\n');
    return estimateTokens(idText) <= maxTokens ? idText : null;
  };

  const text = assemble();
  if (!text) return null;
  return {
    text,
    compacted: true,
    strategy: 'knowledge',
    originalTokens: estimateTokens(originalText),
    tokens: estimateTokens(text),
  };
}

/** fetch_webpage 自限 8000 字：仅在预算更紧时二次裁，保留首行来源头 */
function compactWebpage(output: string, maxTokens: number): CompactOutcome {
  const sep = output.indexOf('\n\n');
  const header = sep > 0 ? output.slice(0, sep) : '';
  const body = sep > 0 ? output.slice(sep + 2) : output;
  const headerTokens = header ? estimateTokens(`${header}\n\n`) : 0;
  const bodyBudget = Math.max(0, maxTokens - headerTokens - estimateTokens(TRUNCATE_HINT));
  const clipped = truncateToTokens(body, bodyBudget);
  const hint = clipped.length < body.length ? `\n${TRUNCATE_HINT}` : '';
  const text = header ? `${header}\n\n${clipped}${hint}` : `${clipped}${hint}`;
  return {
    text,
    compacted: true,
    strategy: 'webpage',
    originalTokens: estimateTokens(output),
    tokens: estimateTokens(text),
  };
}

function withinBudget(text: string, originalTokens: number): CompactOutcome {
  return { text, compacted: false, strategy: 'passthrough', originalTokens, tokens: originalTokens };
}

/** 出口硬保证：任何策略的产物最终都不得超预算（分段估算的 ceil 误差在此统一兜底） */
function guaranteeBudget(
  outcome: CompactOutcome,
  maxTokens: number,
): CompactOutcome {
  if (outcome.tokens <= maxTokens) return outcome;
  const clamped = truncateToTokens(outcome.text, maxTokens);
  return { ...outcome, text: clamped, compacted: true, tokens: estimateTokens(clamped) };
}

/** 纯函数入口：完整工具输出文本 → 入模视图 */
export function compactToolOutput(output: string, opts: CompactOptions): CompactOutcome {
  const { maxTokens, toolName } = opts;
  const originalTokens = estimateTokens(output);
  if (output.trim() === '' || originalTokens <= maxTokens) {
    return withinBudget(output, originalTokens);
  }
  if (opts.source === 'computer' || COMPUTER_TOOL_RE.test(toolName)) {
    return withinBudget(output, originalTokens);
  }

  if (toolName === KNOWLEDGE_TOOL) {
    const fragments = parseKnowledgeBlock(output);
    if (fragments) {
      const outcome = compactKnowledge(fragments, maxTokens);
      if (outcome) return guaranteeBudget(outcome, maxTokens);
    }
  }

  let outcome: CompactOutcome | null = null;
  if (toolName === WEBPAGE_TOOL) outcome = compactWebpage(output, maxTokens);

  // 结构化结果（MCP/flow 常见）：JSON parse 后形状识别 + 取样
  if (!outcome && (opts.source === 'mcp' || opts.source === 'flow' || /^[[{]/.test(output.trimStart()))) {
    try {
      const parsed: unknown = JSON.parse(output);
      if (parsed && typeof parsed === 'object') {
        const result = compactJsonStructure(parsed, maxTokens - estimateTokens(TRUNCATE_HINT));
        if (result) {
          const suffix = result.identityOnly ? `\n${TRUNCATE_HINT}` : '';
          outcome = {
            text: `${result.text}${suffix}`,
            compacted: true,
            strategy: result.identityOnly ? 'identity' : 'json-sampled',
            originalTokens,
            tokens: estimateTokens(`${result.text}${suffix}`),
          };
        }
      }
    } catch {
      // 非 JSON：走通用文本截断
    }
  }

  if (!outcome) {
    const clipped = truncateToTokens(output, Math.max(0, maxTokens - estimateTokens(TRUNCATE_HINT)));
    outcome = {
      text: `${clipped}\n${TRUNCATE_HINT}`,
      compacted: true,
      strategy: 'text',
      originalTokens,
      tokens: estimateTokens(`${clipped}\n${TRUNCATE_HINT}`),
    };
  }
  return guaranteeBudget(outcome, maxTokens);
}

/** ToolResult 入口：错误结果不压（短文本且模型需据其自我纠正）；成功结果压缩 output */
export function compactToolResultForModel(result: ToolResult, opts: CompactOptions): string {
  if (!result.ok) return result.output;
  return compactToolOutput(result.output, opts).text;
}

/** 判定压缩是否实际发生（供 trace 记录 compacted 标记） */
export function wasCompacted(original: string, compacted: string): boolean {
  return original !== compacted;
}
