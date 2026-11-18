import type { ChatMessage } from '@wbfm/ai';
import { CONTEXT_BUDGET_SAFETY_RATIO, DEFAULT_CONTEXT_TOKEN_BUDGET } from '@wbfm/shared/constants';
import type { ContextScene } from '@wbfm/shared/constants';
import type { SceneContextSnapshotPayload } from '@wbfm/shared/schemas';
import {
  IMAGE_TOKEN_ESTIMATE,
  estimateMessageTokens,
  estimateTokens,
  resolveReserveTokens,
} from '../chat/context/context-budget';

/**
 * v4.9 单次提示词装配：
 * 给协作角色 / 桌面任务 / Flow 节点一个统一的窗口上限。
 * 未超预算时逐字返回；超预算时先丢旧消息，再头尾保留截断，最后才动 system。
 */

/** 消息结构余量（role/分隔符/工具声明等无法逐段计入的开销） */
const PROMPT_STRUCTURE_MARGIN = 64;
/** 再小的窗口也保留一个最小可读预算 */
const MIN_PROMPT_BUDGET = 64;
/** 截断时头部保留比例，其余留给尾部 */
const HEAD_RATIO = 0.6;
/** 单条消息截断后的最小保留量 */
const MIN_TRUNCATED_TOKENS = 16;
const TRUNCATION_MARKER = '\n…（上下文已截断）…\n';

export interface FitPromptOptions {
  contextWindow: number | null | undefined;
  scene: ContextScene;
  role?: 'planner' | 'executor' | 'reviewer';
  /** 缺省按窗口比例计算输出预留 */
  reserveTokens?: number;
}

export interface FitPromptResult {
  messages: ChatMessage[];
  stats: SceneContextSnapshotPayload;
}

/** 仅构造快照统计（不做截断）；上下文块等已单独限长的场景使用 */
export function buildSceneSnapshot(input: {
  scene: ContextScene;
  contextWindow: number | null | undefined;
  promptTokens: number;
  budgetTokens: number;
  role?: 'planner' | 'executor' | 'reviewer';
}): SceneContextSnapshotPayload {
  const contextWindow =
    input.contextWindow && input.contextWindow > 0
      ? input.contextWindow
      : DEFAULT_CONTEXT_TOKEN_BUDGET;
  const usableWindow = Math.floor(contextWindow * CONTEXT_BUDGET_SAFETY_RATIO);
  return {
    scene: input.scene,
    ...(input.role ? { role: input.role } : {}),
    contextWindow,
    usableWindow,
    reserveTokens: resolveReserveTokens(null, contextWindow),
    budgetTokens: input.budgetTokens,
    promptTokens: input.promptTokens,
    truncatedMessages: 0,
    droppedMessages: 0,
    truncated: input.promptTokens > input.budgetTokens,
  };
}

function totalTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
}

/** 二分最大安全前缀（不加省略号，便于和尾片段拼装后仍受预算约束） */
function takeHeadTokens(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return '';
  if (estimateTokens(text) <= maxTokens) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (estimateTokens(text.slice(0, mid)) <= maxTokens) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo);
}

/** 二分最大安全后缀 */
function takeTailTokens(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return '';
  if (estimateTokens(text) <= maxTokens) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (estimateTokens(text.slice(mid)) <= maxTokens) hi = mid;
    else lo = mid + 1;
  }
  return text.slice(lo);
}

/** 头 60% + 标记 + 尾 40%；预算小于标记自身时退化为纯头部截断 */
export function truncateTextToTokens(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return '';
  if (estimateTokens(text) <= maxTokens) return text;
  const markerTokens = estimateTokens(TRUNCATION_MARKER);
  if (maxTokens <= markerTokens) return takeHeadTokens(text, maxTokens);
  const contentBudget = maxTokens - markerTokens;
  const headBudget = Math.floor(contentBudget * HEAD_RATIO);
  const tailBudget = contentBudget - headBudget;
  return `${takeHeadTokens(text, headBudget)}${TRUNCATION_MARKER}${takeTailTokens(text, tailBudget)}`;
}

function clipContent(
  content: ChatMessage['content'],
  maxTokens: number,
): ChatMessage['content'] {
  if (content == null) return content;
  if (typeof content === 'string') return truncateTextToTokens(content, maxTokens);
  const imageTokens =
    content.filter((part) => part.type === 'image_url').length * IMAGE_TOKEN_ESTIMATE;
  const textBudget = Math.max(0, maxTokens - imageTokens - 4);
  const textParts = content.filter((part) => part.type === 'text');
  if (textParts.length === 0) return content;
  const totalChars = textParts.reduce((sum, part) => sum + part.text.length, 0) || 1;
  let changed = false;
  const next = content.map((part) => {
    if (part.type !== 'text') return part;
    const share = Math.max(8, Math.floor(textBudget * (part.text.length / totalChars)));
    const clipped = truncateTextToTokens(part.text, share);
    if (clipped === part.text) return part;
    changed = true;
    return { ...part, text: clipped };
  });
  return changed ? next : content;
}

function clipMessage(message: ChatMessage, maxTokens: number): { message: ChatMessage; changed: boolean } {
  const content = clipContent(message.content, maxTokens);
  if (content === message.content) return { message, changed: false };
  return { message: { ...message, content }, changed: true };
}

/**
 * 从最大的消息开始截断，直到回到预算内或没有可再压缩的消息。
 * 先丢旧消息、后截断最大块，避免一上来就砍 system 协议或当前问题。
 */
function truncateLargest(
  messages: ChatMessage[],
  budgetTokens: number,
  truncatedIndices: Set<number>,
): number {
  let promptTokens = totalTokens(messages);
  for (;;) {
    if (promptTokens <= budgetTokens) break;
    let changed = false;
    const order = messages
      .map((message, index) => ({ index, cost: estimateMessageTokens(message) }))
      .sort((a, b) => b.cost - a.cost);
    for (const { index } of order) {
      if (promptTokens <= budgetTokens) break;
      const others = promptTokens - estimateMessageTokens(messages[index]!);
      const allowed = Math.max(MIN_TRUNCATED_TOKENS, budgetTokens - others - 8);
      const clipped = clipMessage(messages[index]!, allowed);
      if (!clipped.changed) continue;
      messages[index] = clipped.message;
      truncatedIndices.add(index);
      promptTokens = totalTokens(messages);
      changed = true;
    }
    if (!changed) break;
  }
  return promptTokens;
}

/**
 * 按窗口装包：总量不超预算时原样返回；超限时先丢弃旧消息，
 * 再从最大的消息开始头尾保留截断。末条消息永不丢弃，只可能被截断。
 */
export function fitPromptMessages(
  messages: ChatMessage[],
  options: FitPromptOptions,
): FitPromptResult {
  const contextWindow =
    options.contextWindow && options.contextWindow > 0
      ? options.contextWindow
      : DEFAULT_CONTEXT_TOKEN_BUDGET;
  const usableWindow = Math.floor(contextWindow * CONTEXT_BUDGET_SAFETY_RATIO);
  const reserveTokens =
    options.reserveTokens ?? resolveReserveTokens(null, contextWindow);
  const budgetTokens = Math.max(
    MIN_PROMPT_BUDGET,
    usableWindow - reserveTokens - PROMPT_STRUCTURE_MARGIN,
  );

  let working = [...messages];
  let promptTokens = totalTokens(working);
  let droppedMessages = 0;
  const truncatedIndices = new Set<number>();

  while (promptTokens > budgetTokens) {
    const lastIndex = working.length - 1;
    const index = working.findIndex(
      (message, i) => i !== lastIndex && message.role !== 'system',
    );
    if (index < 0) break;
    working = working.filter((_, i) => i !== index);
    droppedMessages += 1;
    promptTokens = totalTokens(working);
  }

  promptTokens = truncateLargest(working, budgetTokens, truncatedIndices);

  const systemTokens = working.reduce(
    (sum, message) =>
      message.role === 'system' ? sum + estimateMessageTokens(message) : sum,
    0,
  );
  const stats: SceneContextSnapshotPayload = {
    scene: options.scene,
    ...(options.role ? { role: options.role } : {}),
    contextWindow,
    usableWindow,
    reserveTokens,
    budgetTokens,
    promptTokens,
    systemTokens,
    inputTokens: Math.max(0, promptTokens - systemTokens),
    messageCount: working.length,
    truncatedMessages: truncatedIndices.size,
    droppedMessages,
    truncated: truncatedIndices.size > 0 || droppedMessages > 0,
  };
  return { messages: working, stats };
}
