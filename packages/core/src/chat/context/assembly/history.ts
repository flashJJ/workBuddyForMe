import { HISTORY_MESSAGE_SAFETY_CAP } from '@wbfm/shared/constants';
import type { Assistant, Conversation, Message } from '@wbfm/shared/types';
import type { TurnIntent } from '@wbfm/shared/schemas';
import type { TraceHandle } from '@wbfm/ai';
import type { ServiceDeps } from '../../../services/base/deps';
import type {
  AttachmentService,
  ResolvedImage,
} from '../../../services/assistant/attachment-service';
import type { ConversationService } from '../../../services/assistant/conversation-service';
import { maybePreflightCompact } from '../compression';
import { applyContextMessageCap } from '../turn-context';
import { buildImageMap } from '../multimodal';
import type { ResolvedChatTarget } from '../model-resolver';

export interface LoadTurnHistoryParams {
  deps: ServiceDeps;
  conversations: ConversationService;
  attachments: Pick<AttachmentService, 'loadImages'>;
  assistant: Assistant;
  target: ResolvedChatTarget;
  conversationId: string;
  assistantMessageId: string;
  intent: TurnIntent;
  /** 设置项 contextMessageCount（服务端条数钳制） */
  contextMessageCount: number | undefined;
  preflightEnabled: boolean;
  signal?: AbortSignal;
  traceParent: TraceHandle | null;
}

export interface LoadedTurnHistory {
  /** 预判压缩后的会话（摘要/折叠游标最新） */
  conversation: Conversation;
  /** 已按条数钳制的历史（含本轮用户消息，不含当前助手消息） */
  history: Message[];
  imageMap: Map<string, ResolvedImage>;
  /** 预判压缩后重新估算的未折叠历史 token */
  historyEstimate: number;
}

/**
 * 回合历史装载：预判压缩 → 取未折叠历史 → 条数钳制 → 图片映射。
 * v4.13 从 turn-context-assembly 拆出，纯编排、无事件副作用。
 */
export async function loadTurnHistory(
  params: LoadTurnHistoryParams,
): Promise<LoadedTurnHistory> {
  const { conversations, conversationId, assistantMessageId } = params;
  const conversation = conversations.get(conversationId);
  // v4.8：预判压缩——历史超 85% 水位先折叠，避免本轮撞墙后只能硬截断
  const preflight = await maybePreflightCompact({
    deps: params.deps,
    conversations,
    attachments: params.attachments,
    assistant: params.assistant,
    target: params.target,
    conversation,
    conversationId,
    intent: params.intent,
    enabled: params.preflightEnabled,
    signal: params.signal,
    traceParent: params.traceParent,
  });
  const activeConversation = preflight.conversation;
  const fetchedHistory = conversations
    .recentMessagesAfter(
      conversationId,
      activeConversation.summaryTurns,
      HISTORY_MESSAGE_SAFETY_CAP,
    )
    .filter((message) => message.id !== assistantMessageId);
  // v1.8 M3：先条数钳制（2–50，服务端为准），再交 token 预算双保险裁剪
  const history = applyContextMessageCap(fetchedHistory, params.contextMessageCount);
  // 历史图片（含本轮新图与重生成旧图）解析为 data URL
  const imageMap = buildImageMap(params.attachments, history);
  return {
    conversation: activeConversation,
    history,
    imageMap,
    historyEstimate: preflight.historyEstimate,
  };
}
