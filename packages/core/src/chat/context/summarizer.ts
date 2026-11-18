import {
  COMPACTION_KEEP_RATIO,
  COMPACTION_MIN_KEEP_MESSAGES,
  COMPACTION_TRIGGER_RATIO,
  CONTEXT_QUOTA_HISTORY,
  DEFAULT_CONTEXT_TOKEN_BUDGET,
  MEMORY_BLOCK_RESERVE_TOKENS,
  SMALL_CONTEXT_WINDOW_TOKENS,
  SUMMARY_BLOCK_RESERVE_TOKENS,
} from '@wbfm/shared/constants';
import { type Message } from '@wbfm/shared/types';
import {
  parseSummaryPayload,
  stripSummaryFence,
  type SummaryPayload,
} from '@wbfm/shared/schemas';
import { traceAsync, type ChatMessage, type TraceHandle } from '@wbfm/ai';
import { estimateMessageTokens } from './context-budget';
import {
  appendSnippets,
  checkSummaryFidelity,
  collectSourceSnippets,
} from './summary-fidelity';
import type { ResolvedChatTarget } from './model-resolver';

export interface CompactionPlanInput {
  /** 未折叠历史（时间正序，含刚完成的本轮回答），已映射为 ChatMessage */
  history: ChatMessage[];
  contextWindow: number;
  /** 助手人设 system 占用（不含摘要块本身） */
  personaTokens: number;
  toolsTokens: number;
  reserveTokens: number;
  /** 助手开启长期记忆时为记忆块额外预留预算（默认关，兼容旧调用） */
  memoryEnabled?: boolean;
  /** v4.8：用户显式触发——跳过阈值，折叠最旧约 60% 消息 */
  force?: boolean;
}

export interface CompactionPlan {
  /** 建议折叠的消息条数（历史最旧的 N 条将并入摘要） */
  foldCount: number;
  historyBudget: number;
  totalTokens: number;
}

/**
 * 压缩决策（纯函数）：
 * 历史预算 = 上下文窗口 − 人设 − 工具声明 − 输出预留 − 摘要块预留；
 * 历史占用超过预算 × 触发比例时，折叠最旧消息，保留最近一个逐字后缀
 * （约占预算一半，且至少保护最近 COMPACTION_MIN_KEEP_MESSAGES 条）。
 */
export function planCompaction(input: CompactionPlanInput): CompactionPlan | null {
  const available = Math.max(
    0,
    input.contextWindow -
      input.personaTokens -
      input.toolsTokens -
      input.reserveTokens -
      SUMMARY_BLOCK_RESERVE_TOKENS -
      (input.memoryEnabled ? MEMORY_BLOCK_RESERVE_TOKENS : 0),
  );
  // v2.26 P1：原文配额 50% 与剩余预算取更严格者
  const historyBudget = Math.min(
    available,
    Math.floor(input.contextWindow * CONTEXT_QUOTA_HISTORY),
  );
  if (historyBudget <= 0 || input.history.length <= COMPACTION_MIN_KEEP_MESSAGES) return null;

  const costs = input.history.map(estimateMessageTokens);
  const totalTokens = costs.reduce((sum, cost) => sum + cost, 0);
  if (input.force) {
    const keep = Math.max(
      COMPACTION_MIN_KEEP_MESSAGES,
      Math.ceil(input.history.length * 0.4),
    );
    const foldCount = input.history.length - keep;
    return foldCount >= 1 ? { foldCount, historyBudget, totalTokens } : null;
  }
  if (totalTokens <= historyBudget * COMPACTION_TRIGGER_RATIO) return null;

  // 从新到旧累计逐字后缀，达到预算保留比例即止
  const keepTarget = historyBudget * COMPACTION_KEEP_RATIO;
  let used = 0;
  let keepCount = 0;
  for (let i = input.history.length - 1; i >= 0; i -= 1) {
    const cost = costs[i]!;
    if (keepCount > 0 && used + cost > keepTarget) break;
    used += cost;
    keepCount += 1;
  }
  // 最近消息硬性保护：哪怕超比例也不折叠最近几轮
  keepCount = Math.max(keepCount, COMPACTION_MIN_KEEP_MESSAGES);
  const foldCount = input.history.length - keepCount;
  return foldCount >= 1 ? { foldCount, historyBudget, totalTokens } : null;
}

import { buildSummaryMessages, transcriptLine } from './summary-prompt';

export { buildSummaryMessages } from './summary-prompt';

/** 去除模型偶尔包裹的代码块围栏与多余空白 */
export function normalizeSummary(raw: string): string {
  return stripSummaryFence(raw);
}

export interface SummarizeInput {
  target: ResolvedChatTarget;
  previousSummary: string | null;
  folded: Message[];
  signal?: AbortSignal;
  traceParent?: TraceHandle | null;
}

export interface StructuredSummary {
  payload: SummaryPayload;
  /** 是否因数字/日期保真校验触发过重试 */
  retried: boolean;
  /** 重试后仍缺失、已用原文片段兜底的数字/日期 */
  fidelityMissing: string[];
}

/** 单次摘要请求：流式累积 → 解析 JSON（纯文本自动回退） */
async function requestSummary(
  input: SummarizeInput,
  missing: readonly string[],
  traceName: string,
): Promise<SummaryPayload> {
  const messages = buildSummaryMessages(input.previousSummary, input.folded);
  if (missing.length > 0) {
    messages.push({
      role: 'user',
      content:
        `【保真校验】上一版摘要缺少原文中的数字/日期：${missing.join('、')}。` +
        '请重新输出完整 JSON，务必原样保留这些值。',
    });
  }
  return traceAsync(
    {
      name: traceName,
      runType: 'llm',
      parent: input.traceParent ?? null,
      inputs: {
        foldedMessages: input.folded.length,
        hadPreviousSummary: Boolean(input.previousSummary),
        fidelityRetry: missing.length > 0,
      },
    },
    async () => {
      const stream = input.target.provider.chatStream({
        model: input.target.model.modelId,
        messages,
        temperature: 0,
        signal: input.signal,
      });
      let raw = '';
      for await (const chunk of stream) raw += chunk.delta;
      const payload = parseSummaryPayload(raw);
      if (!payload) throw new Error('对话摘要结果为空');
      return payload;
    },
    (value) => ({ summaryLength: value.summary.length, facts: value.facts.length }),
  );
}

/**
 * 纯文本摘要请求（小窗口退化路径）：不解析 JSON、不做保真重试。
 * 空结果抛错，由编排器吞掉并降级为纯截断。
 */
async function requestPlainSummary(
  input: SummarizeInput,
  traceName: string,
): Promise<string> {
  const messages = buildSummaryMessages(input.previousSummary, input.folded, true);
  return traceAsync(
    {
      name: traceName,
      runType: 'llm',
      parent: input.traceParent ?? null,
      inputs: { foldedMessages: input.folded.length, plain: true },
    },
    async () => {
      const stream = input.target.provider.chatStream({
        model: input.target.model.modelId,
        messages,
        temperature: 0,
        signal: input.signal,
      });
      let raw = '';
      for await (const chunk of stream) raw += chunk.delta;
      const text = normalizeSummary(raw);
      if (!text) throw new Error('对话摘要结果为空');
      return text;
    },
    (value) => ({ summaryLength: value.length }),
  );
}

/**
 * 结构化摘要：JSON 载荷 + 数字/日期保真校验。
 * 缺失时重试一次；仍缺失则把含关键数字的原文片段追加到摘要末尾。
 * 网络/空结果抛错，由编排器吞掉降级为纯截断。
 * v4.8.1：小窗口模型跳过结构化抽取（7B 级模型容易编造事实），直接走纯文本摘要。
 */
export async function summarizeConversationStructured(
  input: SummarizeInput,
): Promise<StructuredSummary> {
  const window = input.target.model.contextWindow ?? DEFAULT_CONTEXT_TOKEN_BUDGET;
  if (window < SMALL_CONTEXT_WINDOW_TOKENS) {
    const summary = await requestPlainSummary(input, 'conversation_summarize_plain');
    return {
      payload: { summary, facts: [], decisions: [], openLoops: [] },
      retried: false,
      fidelityMissing: [],
    };
  }
  const source = input.folded.map(transcriptLine).join('\n');
  let payload = await requestSummary(input, [], 'conversation_summarize');
  let fidelity = checkSummaryFidelity(payload, source);
  let retried = false;

  if (!fidelity.passed) {
    retried = true;
    try {
      const retryPayload = await requestSummary(
        input,
        fidelity.missing,
        'conversation_summarize_retry',
      );
      const retryFidelity = checkSummaryFidelity(retryPayload, source);
      if (retryFidelity.missing.length <= fidelity.missing.length) {
        payload = retryPayload;
        fidelity = retryFidelity;
      }
    } catch {
      // 重试失败保留首版，继续走原文片段兜底
    }
  }

  const missing = fidelity.missing;
  if (missing.length > 0) {
    const snippets = collectSourceSnippets(source, missing);
    if (snippets) payload = { ...payload, summary: appendSnippets(payload.summary, snippets) };
  }
  return { payload, retried, fidelityMissing: missing };
}

/**
 * 调用当前对话模型生成/更新递归摘要（temperature 0）。
 * 返回正文摘要；结构化字段由 summarizeConversationStructured 提供。
 */
export async function summarizeConversation(input: SummarizeInput): Promise<string> {
  const result = await summarizeConversationStructured(input);
  return result.payload.summary;
}
