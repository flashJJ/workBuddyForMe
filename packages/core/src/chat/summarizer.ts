import {
  COMPACTION_KEEP_RATIO,
  COMPACTION_MIN_KEEP_MESSAGES,
  COMPACTION_TRIGGER_RATIO,
  SUMMARY_BLOCK_RESERVE_TOKENS,
  type Message,
} from '@wbfm/shared';
import { traceAsync, type ChatMessage, type TraceHandle } from '@wbfm/ai';
import { estimateMessageTokens } from './context-budget';
import type { ResolvedChatTarget } from './model-resolver';

export interface CompactionPlanInput {
  /** 未折叠历史（时间正序，含刚完成的本轮回答），已映射为 ChatMessage */
  history: ChatMessage[];
  contextWindow: number;
  /** 助手人设 system 占用（不含摘要块本身） */
  personaTokens: number;
  toolsTokens: number;
  reserveTokens: number;
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
  const historyBudget = Math.max(
    0,
    input.contextWindow -
      input.personaTokens -
      input.toolsTokens -
      input.reserveTokens -
      SUMMARY_BLOCK_RESERVE_TOKENS,
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
  '要求：\n' +
  '1. 保留：用户身份与称呼、明确的偏好/约定、已做决定、待办与未解决问题、关键事实与结论；\n' +
  '2. 删除：寒暄、重复内容、与长期上下文无关的临时细节；\n' +
  '3. 已有摘要时做增量合并：保留旧摘要中仍有效的要点，补充/更新新对话内容；\n' +
  '4. 直接输出摘要正文（短句或要点列表），不要标题、不要解释、不要代码块。';

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
  return raw
    .trim()
    .replace(/^```(?:markdown|md|text)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

export interface SummarizeInput {
  target: ResolvedChatTarget;
  previousSummary: string | null;
  folded: Message[];
  signal?: AbortSignal;
  traceParent?: TraceHandle | null;
}

/**
 * 调用当前对话模型生成/更新递归摘要（temperature 0）。
 * 失败（网络/空结果）抛错，由编排器吞掉并降级为纯截断，绝不阻塞回答。
 */
export async function summarizeConversation(input: SummarizeInput): Promise<string> {
  const messages = buildSummaryMessages(input.previousSummary, input.folded);
  const summary = await traceAsync(
    {
      name: 'conversation_summarize',
      runType: 'llm',
      parent: input.traceParent ?? null,
      inputs: { foldedMessages: input.folded.length, hadPreviousSummary: Boolean(input.previousSummary) },
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
      const normalized = normalizeSummary(raw);
      if (!normalized) throw new Error('对话摘要结果为空');
      return normalized;
    },
    (value) => ({ summaryLength: value.length }),
  );
  return summary;
}
