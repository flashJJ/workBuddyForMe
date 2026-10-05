import type { Citation, MemoryKind } from '../types/domain';
import type { PermissionLevel } from '../types/permission';
import type { FlowEventPayload } from '../types/flow';
import type { TaskEventPayload } from '../schemas/task';
import type { ToolEventPayload } from '../types/tool';

/** v0.5：命中的长期记忆轻提示载荷（回答上方「参考了 X 条记忆」） */
export interface RecalledMemoryPayload {
  id: string;
  kind: MemoryKind;
  content: string;
}

/** SSE 事件类型（POST /api/chat/stream） */
export const SSE_EVENT = {
  META: 'meta',
  DELTA: 'delta',
  CITATIONS: 'citations',
  MEMORIES: 'memories',
  TOOL: 'tool',
  /** v0.6 M2：write/danger 工具执行前需用户授权（HITL） */
  TOOL_CONFIRMATION_REQUIRED: 'tool_confirmation_required',
  /** v0.7 M3：任务 Agent 循环（运行/步骤时间线） */
  TASK: 'task',
  /** v0.8 Flow Studio：工作流运行/节点时间线 */
  FLOW: 'flow',
  DONE: 'done',
  ERROR: 'error',
} as const;

export type SseEventName = (typeof SSE_EVENT)[keyof typeof SSE_EVENT];

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type SsePayloadMap = {
  meta: { messageId: string; conversationId: string };
  delta: { content: string };
  citations: { citations: Citation[] };
  memories: { memories: RecalledMemoryPayload[] };
  tool: ToolEventPayload;
  /** write/danger 工具执行前需用户授权 */
  tool_confirmation_required: {
    callId: string;
    tool: string;
    permission: PermissionLevel;
    argsSummary: string;
  };
  /** v0.7 M3：任务运行/步骤事件 */
  task: TaskEventPayload;
  /** v0.8：工作流运行/节点事件 */
  flow: FlowEventPayload;
  done: { content: string; usage: TokenUsage | null };
  error: { code: string; message: string };
};

/** 序列化为 SSE  wire 格式（单行 data JSON） */
export function formatSse<K extends SseEventName>(
  event: K,
  data: SsePayloadMap[K],
): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
