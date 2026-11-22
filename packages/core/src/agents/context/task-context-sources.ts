import type { Conversation } from '@wbfm/shared/types';
import type { ServiceDeps } from '../../services/base/deps';
import { createConversationService } from '../../services/assistant/conversation-service';
import { createMemoryService } from '../../memory/memory-service';
import { formatConstraintBlock, formatMemoryBlock } from '../../memory/turn-memory';
import { buildConversationFactsBlock } from '../../chat/context/conversation-facts-block';
import { buildPlanPromptBlock } from '../../work-plan/plan-prompt';
import { buildCheckpointPromptBlock } from '../../work-plan/task-checkpoint';
import { toModelText } from '../../i18n/system-text';
import type { ContextFragment, ContextSource, ContextSourceId } from '../../context/pipeline';
import { TASK_CONTEXT_RECENT_MESSAGES } from './task-context-budget';

/** 单条消息在上下文块内的最大字符数 */
const MESSAGE_CLIP_CHARS = 400;

export interface TaskContextSourcesParams {
  conversation: Conversation;
  goal: string;
  assistantId: string | null;
  /** 助手是否开启长期记忆召回（沿用对话侧开关） */
  memoryEnabled?: boolean;
  /** 已解析的任务上下文预算（供事实块按 25% 二次限长） */
  budgetTokens: number;
  signal?: AbortSignal;
}

function fragment(source: ContextSourceId, key: string, text: string): ContextFragment {
  return { key, source, priority: 0, text };
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
 * 五个内置任务上下文来源，注册顺序与优先级表一致：
 * 摘要(10) > 事实(20) > 计划(30) > 近期对话(40) > 长期记忆(50)。
 * 来源只负责采集与渲染标题块，排序/去重/预算由 Collector + Packer 统一处理。
 */
export function createTaskContextSources(
  deps: ServiceDeps,
  params: TaskContextSourcesParams,
): ContextSource[] {
  const conversations = createConversationService(deps);
  const conversationId = params.conversation.id;

  return [
    {
      id: 'conversation-summary',
      priority: 10,
      collect: () => {
        const summary = params.conversation.summary?.trim();
        if (!summary) return [];
        return [fragment('conversation-summary', 'summary', `【会话摘要】\n${toModelText(summary)}`)];
      },
    },
    {
      id: 'conversation-facts',
      priority: 20,
      collect: () => {
        const checkpoint = deps.workPlans?.activeCheckpoint(conversationId) ?? null;
        const facts = [
          checkpoint ? buildCheckpointPromptBlock(checkpoint) : null,
          buildConversationFactsBlock(
            conversations.listFacts(conversationId),
            Math.floor(params.budgetTokens * 0.25),
          ),
        ]
          .filter((item): item is string => Boolean(item?.trim()))
          .join('\n\n');
        if (!facts) return [];
        return [fragment('conversation-facts', 'facts', `【已知事实】\n${facts}`)];
      },
    },
    {
      id: 'active-plan',
      priority: 30,
      enabled: () => Boolean(deps.workPlans),
      collect: () => {
        const plan = buildPlanPromptBlock(deps.workPlans!.activeContext(conversationId));
        if (!plan?.trim()) return [];
        return [fragment('active-plan', 'plan', `【当前计划】\n${plan.trim()}`)];
      },
    },
    {
      id: 'recent-messages',
      priority: 40,
      collect: () => {
        const recent = conversations.recentMessagesAfter(
          conversationId,
          params.conversation.summaryTurns,
          TASK_CONTEXT_RECENT_MESSAGES,
        );
        const formatted = formatRecent(recent);
        if (!formatted) return [];
        return [fragment('recent-messages', 'recent', `【近期对话】\n${formatted}`)];
      },
    },
    {
      id: 'long-term-memory',
      priority: 50,
      enabled: () => Boolean(params.memoryEnabled),
      collect: async () => {
        const recalled = await createMemoryService(deps).recall({
          query: params.goal,
          scene: 'task',
          ...(params.assistantId ? { assistantId: params.assistantId } : {}),
          conversationId,
          ...(params.signal ? { signal: params.signal } : {}),
        });
        const memoryBlock = formatMemoryBlock(recalled.filter((item) => item.kind !== 'constraint'));
        const constraintBlock = formatConstraintBlock(recalled);
        const merged = [constraintBlock, memoryBlock].filter((item) => item?.trim()).join('\n\n');
        if (!merged) return [];
        return [fragment('long-term-memory', 'memory', `【相关长期记忆】\n${merged}`)];
      },
    },
  ];
}
