import type { Citation, MemoryKind } from '../types/domain';
import type { PermissionLevel } from '../types/permission';
import type { FlowEventPayload } from '../types/flow';
import type { TaskEventPayload } from '../schemas/task';
import type { ToolEventPayload } from '../types/tool';
import type { VoiceState } from '../schemas/voice';

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
  /** v1.0 语音：按句合成的音频帧（audio=null 为仅展示片段，如表情标签） */
  VOICE_AUDIO: 'voice_audio',
  /** v1.0 语音：会话状态机变更（idle/listening/thinking/speaking） */
  VOICE_STATE: 'voice_state',
  /** v1.3 M4：知识编译进度（首帧快照 + 队列增量） */
  COMPILE: 'compile',
  DONE: 'done',
  ERROR: 'error',
} as const;

export type SseEventName = (typeof SSE_EVENT)[keyof typeof SSE_EVENT];

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** v1.3 M4：编译进度（队列车道内存态，结构与 core CompileKbProgress 一致） */
export interface CompileProgressPayload {
  kbId: string;
  running: boolean;
  currentDocumentId: string | null;
  done: number;
  failed: number;
  total: number;
}

/**
 * v1.3 M4：compile 事件载荷（判别联合）——
 * 首帧快照：counts（DB 状态桶）+ progress（无运行时为 null）；
 * 队列增量：type='progress'|'idle' + progress。
 */
export type CompileSsePayload =
  | {
      counts: { queued: number; running: number; ready: number; failed: number; skipped: number };
      progress: CompileProgressPayload | null;
    }
  | { type: 'progress' | 'idle'; progress: CompileProgressPayload };

export type SsePayloadMap = {
  meta: { messageId: string; conversationId: string; proactive?: boolean };
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
  /** v1.0：一段可朗读文本对应的 WAV（base64）；audio=null 仅驱动字幕/表情 */
  voice_audio: {
    /** 本片段展示文本（含表情标签原文） */
    fragment: string;
    /** 清洗后用于 TTS 的文本；空串表示该片段无声 */
    spoken: string;
    audio: string | null;
    sampleRate: number;
    /** 是否为最后一段（等价于流即将 done） */
    final: boolean;
  };
  /** v1.0：语音状态机变更 */
  voice_state: { state: VoiceState };
  /** v1.3 M4：编译队列内存态投影（与 core CompileKbProgress 结构一致） */
  compile: CompileSsePayload;
  done: { content: string; usage: TokenUsage | null };
  error: { code: string; message: string };
};

/**
 * 线上事件的机械派生源（v1.1 M4）：
 * 任何 `{ event, data }` 事件联合都必须经此类型从 SsePayloadMap 派生，禁止再手写
 * `{ event: 'x'; data: XxxPayload } | …`——手写联合与 wire 真源漂移时编译期不报错。
 *
 * @example
 * type OrchestratorEvent = SseEvent<'meta' | 'delta' | 'done'>;
 * // = { event: 'meta'; data: SsePayloadMap['meta'] } | …
 */
export type SseEvent<K extends SseEventName = SseEventName> = {
  [E in K]: { event: E; data: SsePayloadMap[E] };
}[K];

/** 序列化为 SSE  wire 格式（单行 data JSON） */
export function formatSse<K extends SseEventName>(
  event: K,
  data: SsePayloadMap[K],
): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
