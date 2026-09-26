import { MEMORY_SUMMARY_IMPORTANCE } from '@wbfm/shared';
import type { Assistant, Conversation } from '@wbfm/shared';
import type { ToolDefinition, TraceHandle } from '@wbfm/ai';
import type { AttachmentService } from '../services/attachment-service';
import type { ConversationService } from '../services/conversation-service';
import type { MemoryService } from '../memory/memory-service';
import type { ResolvedChatTarget } from './model-resolver';
import { runPostTurnCompaction } from './turn-context';
import { runPostTurnMemory } from '../memory/turn-memory';

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
  if (!params.assistant.memoryEnabled) return;
  if (compaction?.summary) await rememberSummaryEvent(params, compaction.summary);
  await runPostTurnMemory({
    memory: params.memory,
    target: params.target,
    userContent: params.userContent,
    assistantContent: params.assistantContent,
    conversationId: params.conversation.id,
    signal: params.signal,
    traceParent: params.traceParent,
  });
  runDecaySafely(params);
}
