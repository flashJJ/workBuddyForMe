import type { Assistant, Conversation } from '@wbfm/shared';
import type { ToolDefinition, TraceHandle } from '@wbfm/ai';
import type { AttachmentService } from '../services/attachment-service';
import type { ConversationService } from '../services/conversation-service';
import type { MemoryService } from '../memory/memory-service';
import type { ResolvedChatTarget } from './model-resolver';
import { runPostTurnCompaction } from './turn-context';
import { runPostTurnMemory } from '../memory/turn-memory';

/** v0.5：回合成功后的后台任务统一入口——递归摘要压缩 + 长期记忆提取，均失败静默。 */

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

export async function runPostTurnJobs(params: PostTurnJobsParams): Promise<void> {
  await runPostTurnCompaction({
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
  await runPostTurnMemory({
    memory: params.memory,
    target: params.target,
    userContent: params.userContent,
    assistantContent: params.assistantContent,
    conversationId: params.conversation.id,
    signal: params.signal,
    traceParent: params.traceParent,
  });
}
