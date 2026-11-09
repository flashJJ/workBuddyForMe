import { MEMORY_BLOCK_RESERVE_TOKENS } from '@wbfm/shared/constants';
import type { Memory, MemoryNotice } from '@wbfm/shared/types';
import type { RecalledMemoryPayload } from '@wbfm/shared/api';
import type { TraceHandle } from '@wbfm/ai';
import type { ResolvedChatTarget } from '../chat/context/model-resolver';
import type { OrchestratorEvent } from '../chat/base/types';
import { truncateToTokens } from '../chat/context/context-budget';
import { extractTurnMemories } from './extractor';
import { extractRealtimeConstraints } from './lifecycle';
import type { MemoryService, RecalledMemory } from './memory-service';

/** v0.5 M3：对话回合与记忆服务之间的胶水，编排器只负责调用与吞错边界。 */

const KIND_LABELS: Record<Memory['kind'], string> = {
  fact: '事实',
  preference: '偏好',
  event: '事件',
  relationship: '共同经历',
  constraint: '硬约束',
};

/** 召回记忆格式化为 system 区块正文（按预算硬截断）；无记忆返回 null */
export function formatMemoryBlock(memories: Array<Memory & { neighborOf?: string }>): string | null {
  if (memories.length === 0) return null;
  const byId = new Map(memories.map((memory) => [memory.id, memory]));
  const body = memories
    .map((m) => {
      const seed = m.neighborOf ? byId.get(m.neighborOf) : undefined;
      const suffix = seed ? `（关联自：${truncateToTokens(seed.content, 24)}）` : '';
      return `- ［${KIND_LABELS[m.kind]}］${m.content}${suffix}`;
    })
    .join('\n');
  return truncateToTokens(body, MEMORY_BLOCK_RESERVE_TOKENS);
}

/**
 * v2.26 P1 硬约束块：置顶 constraint 记忆单独成段，注入顺序位于人设之后、
 * 结构化事实与摘要之前，明确其优先于普通记忆与临时要求。
 */
export function formatConstraintBlock(memories: Memory[]): string | null {
  const constraints = memories.filter((m) => m.kind === 'constraint');
  if (constraints.length === 0) return null;
  const body = constraints.map((m) => `- ${m.content}`).join('\n');
  return [
    '【硬约束】以下约束必须始终遵守，优先级高于其他记忆与临时要求：',
    truncateToTokens(body, MEMORY_BLOCK_RESERVE_TOKENS),
  ].join('\n');
}

/**
 * v2.0 M2 主动搭话的关系记忆软引用块（G2）：
 * 只取 relationship 类记忆；纪律=无把握不提、不逐条复述、删除后因召回不到自然不再引用
 * （「可删即不引用」由存储侧保证，此处不做额外固化）。无关系记忆返回 null。
 */
export function buildRelationshipMemoryBlock(memories: Memory[]): string | null {
  const shared = memories.filter((m) => m.kind === 'relationship');
  if (shared.length === 0) return null;
  return [
    '【你和用户的共同经历】',
    '以下是你和用户一起经历过、只属于你们两人的事：',
    shared.map((m) => `- ${m.content}`).join('\n'),
    '搭话时只有在某条经历与当下自然相关时，才轻轻带一句；不确定相关性就完全不提；',
    '不要逐条罗列，不要说“根据记忆/记录”，也不要生硬煽情。',
  ].join('\n');
}

/** SSE memories 事件负载（只下发展示必需字段，不暴露内部 id 之外的管理字段） */
export function toRecalledPayload(memories: RecalledMemory[]): RecalledMemoryPayload[] {
  return memories.map((m) => ({
    id: m.id,
    kind: m.kind,
    content: m.content,
    sourceConversationId: m.sourceConversationId,
    sourceMessageId: m.sourceMessageId,
    score: m.score,
    reason: m.reason,
    neighborOf: m.neighborOf,
  }));
}

export interface RecallTurnParams {
  memory: MemoryService;
  query: string;
  /** v2.26：作用域过滤 */
  assistantId?: string | null;
  conversationId?: string | null;
  signal?: AbortSignal;
  traceParent?: TraceHandle | null;
}

/** 回合前召回；服务内部已对未配置嵌入模型等场景退化为关键词召回 */
export async function recallTurnMemories(params: RecallTurnParams): Promise<RecalledMemory[]> {
  return params.memory.recall(params.query, {
    signal: params.signal,
    traceParent: params.traceParent,
    assistantId: params.assistantId ?? null,
    conversationId: params.conversationId ?? null,
  });
}

/**
 * 编排器专用：召回记忆并在命中时 yield memories 事件；
 * 召回失败仅告警、返回空数组，绝不阻塞回答。
 */
export async function* safeRecallEvent(
  params: RecallTurnParams,
): AsyncGenerator<OrchestratorEvent, RecalledMemory[]> {
  try {
    const memories = await recallTurnMemories(params);
    if (memories.length > 0) {
      yield { event: 'memories', data: { memories: toRecalledPayload(memories) } };
    }
    return memories;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      `[wbfm] 长期记忆召回失败，本轮不注入记忆：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return [];
  }
}

export interface PostTurnMemoryParams {
  memory: MemoryService;
  target: ResolvedChatTarget;
  userContent: string;
  assistantContent: string;
  conversationId: string;
  /** v2.26：当前助手（记忆作用域） */
  assistantId: string;
  /** v2.6：本轮助手消息 id（记忆来源消息） */
  sourceMessageId: string;
  signal?: AbortSignal;
  traceParent?: TraceHandle | null;
}

export interface RealtimeConstraintParams {
  memory: MemoryService;
  userContent: string;
  conversationId: string;
  assistantId: string;
  sourceMessageId: string;
  signal?: AbortSignal;
  traceParent?: TraceHandle | null;
}

/**
 * v2.28 P1：done 帧前同步写入实时硬约束（纯规则 + 单条事务，零模型成本）。
 * 返回本轮需内联提示的记忆（最多 2 条）；失败只告警，不阻塞回答收尾。
 */
export async function writeRealtimeConstraints(
  params: RealtimeConstraintParams,
): Promise<MemoryNotice[]> {
  const candidates = extractRealtimeConstraints(params.userContent);
  if (candidates.length === 0) return [];
  try {
    const result = await params.memory.rememberCandidates(candidates, {
      scope: 'assistant',
      assistantId: params.assistantId,
      source: 'realtime',
      sourceConversationId: params.conversationId,
      sourceMessageId: params.sourceMessageId,
      skipEmbedding: true,
      signal: params.signal,
      traceParent: params.traceParent,
    });
    return result.memories.slice(0, 2).map((m) => ({ id: m.id, content: m.content }));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      `[wbfm] 实时约束写入失败，本轮跳过：${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

/**
 * 回合成功后写入常规记忆：模型抽取 → 去重/取代后入库。
 * 实时硬约束已在 done 帧前由 writeRealtimeConstraints 写入，此处不再重复。
 * 失败一律静默，仅告警，绝不影响已完成的回答。
 */
export async function runPostTurnMemory(params: PostTurnMemoryParams): Promise<void> {
  try {
    const candidates = await extractTurnMemories({
      target: params.target,
      userContent: params.userContent,
      assistantContent: params.assistantContent,
      signal: params.signal,
      traceParent: params.traceParent,
    });
    if (candidates.length === 0) return;
    await params.memory.rememberCandidates(candidates, {
      scope: 'assistant',
      assistantId: params.assistantId,
      source: 'extract',
      sourceConversationId: params.conversationId,
      sourceMessageId: params.sourceMessageId,
      signal: params.signal,
      traceParent: params.traceParent,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      `[wbfm] 长期记忆提取失败，本轮不写入记忆：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
