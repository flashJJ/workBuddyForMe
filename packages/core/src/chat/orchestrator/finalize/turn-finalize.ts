import type { Citation, ToolTraceEntry } from '@wbfm/shared';
import type { TokenUsage } from '@wbfm/shared/api';
import type { Assistant, Conversation, MemoryNotice } from '@wbfm/shared/types';
import type { ToolDefinition } from '@wbfm/ai';
import type { ServiceDeps } from '../../../services/base/deps';
import type { ConversationService } from '../../../services/assistant/conversation-service';
import type { AttachmentService } from '../../../services/assistant/attachment-service';
import type { MemoryService } from '../../../memory/memory-service';
import type { EmotionService } from '../../../emotion/index';
import { recordTurnEmotion } from '../../../emotion/index';
import { recordMilestone } from '../../../services/base/milestones';
import { writeRealtimeConstraints } from '../../../memory/turn-memory';
import type { OrchestratorEvent } from '../../base/types';
import type { ResolvedChatTarget } from '../../context/model-resolver';
import { buildDoneData } from '../orchestrator-helpers';
import { schedulePostTurnJobs } from '../../turns/post-turn-schedule';

/**
 * v4.18：成功回合收口（情绪解析 → 落库 → done → 后台任务）。
 * 从 chat-orchestrator 拆出，保持主流程文件在 300 行以内；
 * state 为可变对象，调用方在 helper 返回后仍能拿到最终正文与 usage（finally 追踪用）。
 */
export interface TurnFinalizeState {
  full: string;
  usage: TokenUsage | null;
}

export interface TurnFinalizeParams {
  deps: ServiceDeps;
  conversations: ConversationService;
  attachments: AttachmentService;
  assistant: Assistant;
  conversation: Conversation;
  target: ResolvedChatTarget;
  toolDefs: ToolDefinition[];
  memory: MemoryService;
  emotion: EmotionService;
  emotionEnabled: boolean;
  assistantMessageId: string;
  userContent: string;
  citations: Citation[];
  intentNotices: MemoryNotice[];
  trace: ToolTraceEntry[];
  /** v4.20：寒暄快路径跳过回合后记忆提取 */
  fastChitchat: boolean;
  signal?: AbortSignal;
  state: TurnFinalizeState;
  schedule: Parameters<typeof schedulePostTurnJobs>[0]['schedule'];
}

export async function* finalizeSuccessfulTurn(
  params: TurnFinalizeParams,
): AsyncGenerator<OrchestratorEvent> {
  const {
    deps,
    conversations,
    attachments,
    assistant,
    conversation,
    target,
    toolDefs,
    memory,
    emotion,
    emotionEnabled,
    assistantMessageId,
    userContent,
    citations,
    intentNotices,
    trace,
    fastChitchat,
    signal,
    state,
    schedule,
  } = params;

  // v1.6：成功回合的情绪解析（尾块剥离/弱模型保底/写状态与流水），异常不影响正文
  const recordedEmotion = recordTurnEmotion({
    enabled: emotionEnabled,
    rawContent: state.full,
    userContent,
    assistantId: assistant.id,
    messageId: assistantMessageId,
    record: emotion.record,
  });
  if (recordedEmotion) state.full = recordedEmotion.content;
  const resolvedEmotion = recordedEmotion?.signal;

  // 持久化最终引用（含开流前 RAG 与工具循环 knowledge_search 两路合并后的全集）
  conversations.completeMessage(assistantMessageId, state.full, state.usage, citations);
  conversations.saveMessageToolTrace(assistantMessageId, trace);
  // v2.4 M1 T7：首次完整回答即记里程碑（首写优先；不含回答内容）
  recordMilestone(deps.db, 'firstAnswerAt');
  // v2.28 P1：实时约束在 done 前同步写入，本轮即可内联提示与撤销
  const memoryNotices = assistant.memoryEnabled
    ? await writeRealtimeConstraints({
        memory,
        userContent,
        conversationId: conversation.id,
        assistantId: assistant.id,
        sourceMessageId: assistantMessageId,
      })
    : [];

  // 先把 done 交给用户：回答已完整落库，旁路任务（摘要/记忆抽取）绝不阻塞 done。
  yield {
    event: 'done',
    data: buildDoneData({
      content: state.full,
      usage: state.usage,
      notices: [...intentNotices, ...memoryNotices],
      ...(resolvedEmotion ? { emotion: resolvedEmotion } : {}),
    }),
  };

  // 后台任务 fire-and-forget：独立 signal，超时兜底；失败内部均已静默。
  schedulePostTurnJobs({
    schedule,
    aborted: Boolean(signal?.aborted),
    jobs: {
      conversations,
      attachments,
      conversation,
      assistant,
      target,
      toolDefs,
      lastCompletionTokens: state.usage?.completionTokens ?? null,
      memory,
      userContent,
      assistantContent: state.full,
      sourceMessageId: assistantMessageId,
      workPlans: deps.workPlans,
      toolTrace: trace,
      fastChitchat,
      events: deps.events,
    },
  });
}
