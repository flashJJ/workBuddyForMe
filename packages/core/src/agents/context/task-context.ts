import type { ServiceDeps } from '../../services/base/deps';
import { createConversationService } from '../../services/assistant/conversation-service';
import { createMemoryService } from '../../memory/memory-service';
import { formatConstraintBlock, formatMemoryBlock } from '../../memory/turn-memory';
import { buildConversationFactsBlock } from '../../chat/context/conversation-facts-block';
import { truncateToTokens } from '../../chat/context/context-budget';
import { buildPlanPromptBlock } from '../../work-plan/plan-prompt';
import { buildCheckpointPromptBlock } from '../../work-plan/task-checkpoint';
import { toModelText } from '../../i18n/system-text';

/**
 * v4.7 任务上下文装配：
 * 任务模式此前只拿 goal，Planner/Executor 完全不知道会话刚才在聊什么。
 * 本模块按「摘要 > 事实 > 计划 > 近期对话 > 长期记忆」优先级装配一个上下文块，
 * 由协作入口一次性计算、每个决策回合复用（不在循环内重复查询/检索）。
 *
 * 预算独立于子任务单与工具目录：超限时从尾部（记忆 → 近期对话）开始截断，
 * 保证摘要/事实这类高密度信息优先保留。
 */

/** 注入的任务上下文 token 预算（字符粗估） */
export const TASK_CONTEXT_BUDGET_TOKENS = 2_000;
/** 近期对话注入条数（含用户与助手消息） */
export const TASK_CONTEXT_RECENT_MESSAGES = 6;
/** 单条消息在上下文块内的最大字符数 */
const MESSAGE_CLIP_CHARS = 400;

export interface BuildTaskContextParams {
  conversationId: string | null;
  goal: string;
  assistantId: string | null;
  /** 助手是否开启长期记忆召回（沿用对话侧开关） */
  memoryEnabled?: boolean;
  budgetTokens?: number;
  signal?: AbortSignal;
}

function formatRecent(messages: Array<{ role: string; content: string }>): string | null {
  const lines: string[] = [];
  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    const text = toModelText(message.content ?? '').trim();
    if (!text) continue;
    const clipped = text.length > MESSAGE_CLIP_CHARS ? `${text.slice(0, MESSAGE_CLIP_CHARS)}…` : text;
    lines.push(`${message.role === 'user' ? '用户' : '助手'}：${clipped}`);
  }
  return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * 装配任务上下文块；无会话或内容为空时返回 null（调用方按「无上下文」处理）。
 * 单次查询失败不阻断任务：各来源独立 try/catch，最差返回 null。
 */
export async function buildTaskContextBlock(
  deps: ServiceDeps,
  params: BuildTaskContextParams,
): Promise<string | null> {
  if (!params.conversationId) return null;
  const conversations = createConversationService(deps);
  let conversation;
  try {
    conversation = conversations.get(params.conversationId);
  } catch {
    return null;
  }

  const blocks: string[] = [];
  const budget = params.budgetTokens ?? TASK_CONTEXT_BUDGET_TOKENS;

  // 1) 会话递归摘要（最高密度）
  const summary = conversation.summary?.trim();
  if (summary) blocks.push(`【会话摘要】\n${toModelText(summary)}`);

  // 2) 结构化事实（含当前计划检查点，先于摘要之外的原文）
  const checkpoint = deps.workPlans?.activeCheckpoint(params.conversationId) ?? null;
  const facts = [
    checkpoint ? buildCheckpointPromptBlock(checkpoint) : null,
    buildConversationFactsBlock(conversations.listFacts(params.conversationId), Math.floor(budget * 0.25)),
  ]
    .filter((item): item is string => Boolean(item?.trim()))
    .join('\n\n');
  if (facts) blocks.push(`【已知事实】\n${facts}`);

  // 3) 当前计划/待办（未批准计划会标注待评审）
  const plan = deps.workPlans ? buildPlanPromptBlock(deps.workPlans.activeContext(params.conversationId)) : '';
  if (plan?.trim()) blocks.push(`【当前计划】\n${plan.trim()}`);

  // 4) 近期对话原文（跳过已折叠进摘要的轮次）
  try {
    const recent = conversations.recentMessagesAfter(
      params.conversationId,
      conversation.summaryTurns,
      TASK_CONTEXT_RECENT_MESSAGES,
    );
    const formatted = formatRecent(recent);
    if (formatted) blocks.push(`【近期对话】\n${formatted}`);
  } catch {
    /* 历史读取失败不阻断任务 */
  }

  // 5) 与目标相关的长期记忆（助手开启时）
  if (params.memoryEnabled) {
    try {
      const recalled = await createMemoryService(deps).recall(params.goal, {
        ...(params.assistantId ? { assistantId: params.assistantId } : {}),
        conversationId: params.conversationId,
        ...(params.signal ? { signal: params.signal } : {}),
      });
      const memoryBlock = formatMemoryBlock(recalled.filter((item) => item.kind !== 'constraint'));
      const constraintBlock = formatConstraintBlock(recalled);
      const merged = [constraintBlock, memoryBlock].filter((item) => item?.trim()).join('\n\n');
      if (merged) blocks.push(`【相关长期记忆】\n${merged}`);
    } catch {
      /* 记忆召回失败不阻断任务 */
    }
  }

  if (blocks.length === 0) return null;
  return truncateToTokens(blocks.join('\n\n'), budget);
}
