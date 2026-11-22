import type { ServiceDeps } from '../../services/base/deps';
import { createConversationService } from '../../services/assistant/conversation-service';
import { collectContext, packContext } from '../../context/pipeline';
import { createTaskContextSources } from './task-context-sources';
import { resolveTaskContextBudget } from './task-context-budget';

/**
 * 任务上下文装配（v4.22 起为 Controller Pipeline）：
 * 任务模式此前只拿 goal，Planner/Executor 完全不知道会话刚才在聊什么。
 * 本模块按「摘要 > 事实 > 计划 > 近期对话 > 长期记忆」优先级装配一个上下文块，
 * 由协作入口一次性计算、每个决策回合复用（不在循环内重复查询/检索）。
 *
 * v4.22：装配流程拆成 `collectContext`（并发采集、单来源失败隔离）与
 * `packContext`（优先级排序、去重、预算裁剪）两段纯能力；来源见 task-context-sources。
 * 预算独立于子任务单与工具目录：超限时从尾部（记忆 → 近期对话）开始丢弃，
 * 保证摘要/事实这类高密度信息优先保留。
 */

export * from './task-context-budget';

export interface BuildTaskContextParams {
  conversationId: string | null;
  goal: string;
  assistantId: string | null;
  /** 助手是否开启长期记忆召回（沿用对话侧开关） */
  memoryEnabled?: boolean;
  /** 执行模型上下文窗口（null=未知，用默认预算；小模型按比例收敛） */
  contextWindow?: number | null;
  budgetTokens?: number;
  signal?: AbortSignal;
}

/**
 * 装配任务上下文块；无会话或内容为空时返回 null（调用方按「无上下文」处理）。
 * 单来源失败不阻断任务：Collector 逐来源容错，整体异常按「无上下文」降级。
 */
export async function buildTaskContextBlock(
  deps: ServiceDeps,
  params: BuildTaskContextParams,
): Promise<string | null> {
  if (!params.conversationId) return null;
  let conversation;
  try {
    conversation = createConversationService(deps).get(params.conversationId);
  } catch {
    return null;
  }

  const budget = params.budgetTokens ?? resolveTaskContextBudget(params.contextWindow);
  try {
    const collected = await collectContext(
      createTaskContextSources(deps, {
        conversation,
        goal: params.goal,
        assistantId: params.assistantId,
        memoryEnabled: params.memoryEnabled,
        budgetTokens: budget,
        signal: params.signal,
      }),
      {
        conversationId: params.conversationId,
        goal: params.goal,
        assistantId: params.assistantId,
        contextWindow: params.contextWindow,
        budgetTokens: budget,
        signal: params.signal,
      },
    );
    return packContext(collected.fragments, { budgetTokens: budget }).text;
  } catch {
    return null;
  }
}
