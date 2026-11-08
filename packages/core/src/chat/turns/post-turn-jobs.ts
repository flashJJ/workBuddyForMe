import { MEMORY_SUMMARY_IMPORTANCE } from '@wbfm/shared/constants';
import type { Assistant, Conversation, ToolTraceEntry } from '@wbfm/shared/types';
import type { ToolDefinition, TraceHandle } from '@wbfm/ai';
import type { AttachmentService } from '../../services/assistant/attachment-service';
import type { ConversationService } from '../../services/assistant/conversation-service';
import type { MemoryService } from '../../memory/memory-service';
import type { WorkPlanService } from '../../work-plan';
import type { ResolvedChatTarget } from '../context/model-resolver';
import { runPostTurnCompaction } from '../context/turn-context';
import { runPostTurnMemory } from '../../memory/turn-memory';

/** v0.5：回合成功后的后台任务统一入口——递归摘要压缩 + 长期记忆提取/衰减，均失败静默。 */

export interface PostTurnJobsParams {
  conversations: ConversationService;
  attachments: AttachmentService;
  conversation: Conversation;
  assistant: Assistant;
  target: ResolvedChatTarget;
  toolDefs: ToolDefinition[];
  /** 本轮真实 completion tokens（校准下轮输出预留） */
  lastCompletionTokens: number | null;
  memory: MemoryService;
  userContent: string;
  assistantContent: string;
  /** v2.6：本轮助手消息 id（记忆来源） */
  sourceMessageId: string;
  /** v2.26 P1：目标/计划/待办服务（未提供时不做工作记忆检查点） */
  workPlans?: WorkPlanService;
  /** v2.26 P1：本轮工具执行轨迹（检查点记录最近工具结果摘要） */
  toolTrace?: readonly ToolTraceEntry[];
  signal?: AbortSignal;
  traceParent: TraceHandle | null;
}

function warn(message: string, error: unknown): void {
  // eslint-disable-next-line no-console
  console.warn(`[wbfm] ${message}：${error instanceof Error ? error.message : String(error)}`);
}

/** 压缩摘要作为情景记忆（event）入库，向量去重会与已有摘要记忆增量合并 */
async function rememberSummaryEvent(params: PostTurnJobsParams, summary: string): Promise<void> {
  try {
    await params.memory.rememberOne(
      {
        kind: 'event',
        content: `早期对话摘要：${summary}`,
        importance: MEMORY_SUMMARY_IMPORTANCE,
        sourceConversationId: params.conversation.id,
        // 摘要来自更早消息，无法定位单一来源消息；不伪造
        sourceMessageId: null,
        scope: 'assistant',
        assistantId: params.assistant.id,
        source: 'summary',
      },
      params.signal,
    );
  } catch (error) {
    warn('对话摘要记忆化失败', error);
  }
}

function runDecaySafely(params: PostTurnJobsParams): void {
  try {
    params.memory.runDecay();
  } catch (error) {
    warn('长期记忆衰减任务失败', error);
  }
}

export async function runPostTurnJobs(params: PostTurnJobsParams): Promise<void> {
  const compaction = await runPostTurnCompaction({
    conversations: params.conversations,
    attachments: params.attachments,
    conversation: params.conversation,
    assistant: params.assistant,
    target: params.target,
    toolDefs: params.toolDefs,
    lastCompletionTokens: params.lastCompletionTokens,
    signal: params.signal,
    traceParent: params.traceParent,
  });
  // v2.26 P1：无论长期记忆是否开启，每轮都刷新工作记忆检查点
  if (params.workPlans) {
    try {
      params.workPlans.saveCheckpoint(params.conversation.id, { lastTrace: params.toolTrace });
    } catch (error) {
      warn('任务检查点保存失败', error);
    }
  }
  if (!params.assistant.memoryEnabled) return;
  if (compaction?.summary) await rememberSummaryEvent(params, compaction.summary);
  await runPostTurnMemory({
    memory: params.memory,
    target: params.target,
    userContent: params.userContent,
    assistantContent: params.assistantContent,
    conversationId: params.conversation.id,
    assistantId: params.assistant.id,
    sourceMessageId: params.sourceMessageId,
    signal: params.signal,
    traceParent: params.traceParent,
  });
  runDecaySafely(params);
}
