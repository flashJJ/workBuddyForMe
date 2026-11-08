import {
  COMPACTION_KEEP_RATIO,
  COMPACTION_MIN_KEEP_MESSAGES,
  COMPACTION_TRIGGER_RATIO,
  CONTEXT_QUOTA_HISTORY,
  MEMORY_BLOCK_RESERVE_TOKENS,
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

const SUMMARY_SYSTEM_INSTRUCTION =
  '你是对话摘要助手。把给定的早期对话压缩为结构化中文摘要，供后续对话参考。\n' +
  '只输出一个 JSON 对象，不要解释、不要代码块，格式：\n' +
  '{"summary":"...","facts":[{"key":"...","value":"...","unit":null,"validFrom":null}],' +
  '"decisions":["..."],"open_loops":["..."]}\n' +
  '要求：\n' +
  '1. summary 保留：用户身份与称呼、明确的偏好/约定、已做决定、待办与未解决问题、关键事实与结论；\n' +
  '2. facts 只放稳定可复用的事实，key 用稳定的英文小写下划线键（如 residence_city、budget），' +
  '同一主体的属性复用同一 key；unit/validFrom 缺失填 null；\n' +
  '3. decisions 记录已经确定的决定，open_loops 记录尚未解决的问题；\n' +
  '4. 原文出现的数字、日期、金额必须原样保留在 summary 或 facts 中；\n' +
  '5. 已有摘要时做增量合并：保留旧摘要中仍有效的要点，补充/更新新对话内容；\n' +
  '6. 删除寒暄、重复内容、与长期上下文无关的临时细节。';

/** 单条消息转摘要用文本行（图片消息无可摘要文本） */
function transcriptLine(message: Message): string {
  const role = message.role === 'user' ? '用户' : '助手';
  const content = message.content.trim();
  return `${role}：${content || '（图片/附件消息）'}`;
}

/**
 * 构造摘要请求：旧摘要（若有）+ 待折叠转写。
 * 温度由调用方固定为 0。
 */
export function buildSummaryMessages(
  previousSummary: string | null,
  folded: Message[],
): ChatMessage[] {
  const transcript = folded.map(transcriptLine).join('\n');
  const userParts = [
    previousSummary ? `【已有摘要】\n${previousSummary}` : '',
    `【需要合并的早期对话】\n${transcript}`,
    '请输出合并后的最新摘要。',
  ].filter(Boolean);
  return [
    { role: 'system', content: SUMMARY_SYSTEM_INSTRUCTION },
    { role: 'user', content: userParts.join('\n\n') },
  ];
}

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
 * 结构化摘要：JSON 载荷 + 数字/日期保真校验。
 * 缺失时重试一次；仍缺失则把含关键数字的原文片段追加到摘要末尾。
 * 网络/空结果抛错，由编排器吞掉降级为纯截断。
 */
export async function summarizeConversationStructured(
  input: SummarizeInput,
): Promise<StructuredSummary> {
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
