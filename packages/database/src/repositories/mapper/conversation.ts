import type {
  Citation,
  ContentPart,
  Conversation,
  Message,
  ToolTraceEntry,
} from '@wbfm/shared/types';
import type { MessageRole, MessageStatus } from '@wbfm/shared/constants';
import { parseJsonArray } from './common';

export interface ConversationRow {
  id: string;
  assistant_id: string;
  title: string;
  last_message_at: string | null;
  /** v0.5：递归摘要（NULL=未压缩） */
  summary: string | null;
  /** v0.5：已折叠消息条数（累计） */
  summary_turns: number;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  citations: string;
  tool_trace: string;
  content_parts: string;
  feedback: string | null;
  feedback_at: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}

export function mapConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    assistantId: row.assistant_id,
    title: row.title,
    lastMessageAt: row.last_message_at,
    summary: row.summary ?? null,
    summaryTurns: row.summary_turns ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    status: row.status,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    citations: parseJsonArray<Citation>(row.citations),
    toolTrace: parseJsonArray<ToolTraceEntry>(row.tool_trace),
    contentParts: parseJsonArray<ContentPart>(row.content_parts),
    feedback: row.feedback === 'up' || row.feedback === 'down' ? row.feedback : null,
    feedbackAt: row.feedback_at ?? null,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}
