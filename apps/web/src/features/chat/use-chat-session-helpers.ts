import type { ContentPart, Message } from '@wbfm/shared/types';
import type { SsePayloadMap } from '@wbfm/shared/api';
import type { ChatStreamInput } from '@/lib/hooks/use-chat-stream';
import type { PendingToolConfirmation } from './chat-session.types';

function nowIso(): string {
  return new Date().toISOString();
}

/** 文本 + 图片附件 → 用户消息 contentParts */
function buildUserParts(content: string, attachmentIds: string[]): ContentPart[] {
  const parts: ContentPart[] = [];
  if (content) parts.push({ type: 'text', text: content });
  for (const attachmentId of attachmentIds) parts.push({ type: 'image', attachmentId });
  return parts;
}

/** 本地乐观消息骨架（id/conversationId 待 meta 事件回填） */
export function pendingMessage(role: Message['role'], content: string): Message {
  return {
    id: '',
    conversationId: '',
    role,
    content,
    contentParts: [],
    status: 'completed',
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    citations: [],
    toolTrace: [],
    feedback: null,
    feedbackAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: nowIso(),
  };
}

/**
 * 一轮对话的本地 live 视图：
 * regenerate 去掉尾部旧助手消息后挂占位；普通轮追加用户消息 + 流式助手占位。
 */
export function buildTurnMessages(
  source: Message[],
  assistantMessage: Message,
  options: { content: string; regenerate: boolean; attachments: string[] },
): Message[] {
  const { content, regenerate, attachments } = options;
  if (regenerate) {
    // 去掉尾部旧助手消息（错误/已完成），挂上新的占位
    const trimmed = [...source];
    if (trimmed.length && trimmed[trimmed.length - 1]!.role === 'assistant') {
      trimmed.pop();
    }
    return [...trimmed, assistantMessage];
  }
  const userMessage: Message = {
    ...pendingMessage('user', content),
    contentParts: buildUserParts(content, attachments),
  };
  return [...source, userMessage, assistantMessage];
}

/** delta 增量归并到最后一条助手消息（无 live 视图时原样返回） */
export function appendAssistantDelta(prev: Message[] | null, delta: string): Message[] | null {
  if (!prev) return prev;
  const next = [...prev];
  const last = next[next.length - 1];
  if (last && last.role === 'assistant') {
    next[next.length - 1] = { ...last, content: last.content + delta };
  }
  return next;
}

/** tool_confirmation_required 事件载荷 → HITL 弹窗状态 */
export function confirmationFromPayload(
  data: SsePayloadMap['tool_confirmation_required'],
): PendingToolConfirmation {
  return {
    callId: data.callId,
    tool: data.tool,
    permission: data.permission,
    argsSummary: data.argsSummary,
  };
}

/** done 事件 → 最后一条助手消息的终态补丁 */
export function completedPatch(data: SsePayloadMap['done']): Partial<Message> {
  return {
    status: 'completed',
    content: data.content,
    promptTokens: data.usage?.promptTokens ?? null,
    completionTokens: data.usage?.completionTokens ?? null,
    totalTokens: data.usage?.totalTokens ?? null,
  };
}

/** 主动停止：把最后一条仍在流式的助手消息标记为 stopped */
export function markStreamingAssistantStopped(prev: Message[] | null): Message[] | null {
  if (!prev) return prev;
  const next = [...prev];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const item = next[i]!;
    if (item.role === 'assistant' && item.status === 'streaming') {
      next[i] = { ...item, status: 'stopped' };
      return next;
    }
  }
  return next;
}

/** 反馈提交成功后同步到本地 live 视图 */
export function applyMessageFeedback(
  prev: Message[] | null,
  messageId: string,
  feedback: Message['feedback'],
  feedbackAt: string | null,
): Message[] | null {
  if (!prev) return prev;
  return prev.map((m) => (m.id === messageId ? { ...m, feedback, feedbackAt } : m));
}

/** 构造对话流请求体（可选字段按条件携带） */
export function buildStreamInput(options: {
  assistantId: string;
  conversationId: string | null;
  content: string;
  attachments: string[];
  regenerate: boolean;
  ttsEnabled: boolean;
}): ChatStreamInput {
  const { assistantId, conversationId, content, attachments, regenerate, ttsEnabled } = options;
  return {
    assistantId,
    ...(conversationId ? { conversationId } : {}),
    content,
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(regenerate ? { regenerate: true } : {}),
    ...(ttsEnabled ? { voice: { tts: true } } : {}),
  };
}
