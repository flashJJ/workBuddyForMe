import type { Citation, MemoryKind, MemoryRecallReason } from '../types/domain';
import type { PermissionLevel } from '../types/permission';
import type { FlowEventPayload } from '../types/flow';
import type { TaskEventPayload } from '../schemas/task';
import type { ToolEventPayload } from '../types/tool';
import type { VoiceState } from '../schemas/voice';
import type { EmotionSignal } from '../schemas/emotion';
import type { WorkSignalSnapshot } from '../work-signal';
import type {
  AgentBudgetUsage,
  AgentHandoffView,
  AgentPhase,
  AgentRole,
  ReviewVerdictPayload,
} from '../schemas/agent';

/**
 * v0.5：命中的长期记忆轻提示载荷（回答上方「参考了 X 条记忆」）。
 * v2.6：补来源会话/消息、召回分数与理由，供对话内溯源；旧客户端忽略新增字段。
 */
export interface RecalledMemoryPayload {
  id: string;
  kind: MemoryKind;
  content: string;
  /** 来源会话（可空：手工记忆/旧数据） */
  sourceConversationId: string | null;
  /** 来源助手消息（可空：旧数据/摘要记忆） */
  sourceMessageId: string | null;
  /** 语义相似度 0~1（内部排序用；UI 只展示高/中/低档） */
  score: number;
  reason: MemoryRecallReason;
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
  /** v1.4：多智能体协作（角色/轮次切换、交接、裁决、预算、增量文本） */
  AGENT_PHASE: 'agent_phase',
  AGENT_HANDOFF: 'agent_handoff',
  AGENT_REVIEW: 'agent_review',
  AGENT_BUDGET: 'agent_budget',
  AGENT_DELTA: 'agent_delta',
  /** v1.4 M4：协作 Executor 调用 write/danger 工具前的人工授权请求（HITL；决策回 POST /api/tools/confirm） */
  AGENT_TOOL_CONFIRM: 'agent_tool_confirm',
  /** v1.9 M3：会议模式（本轮发言序列/流式台词/落库消息/状态机） */
  MEETING_TURN: 'meeting_turn',
  MEETING_DELTA: 'meeting_delta',
  MEETING_MESSAGE: 'meeting_message',
  MEETING_STATUS: 'meeting_status',
  /** v2.7：工作信号快照（桌宠/审批页独立订阅） */
  WORK_SIGNAL: 'work_signal',
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
  /** v1.4：角色/阶段切换（泳道高亮与轮次标记） */
  agent_phase: {
    runId: string;
    phase: AgentPhase;
    role: AgentRole | null;
    round: number;
  };
  /** v1.4：一次角色交接落库后的广播（泳道卡片数据源） */
  agent_handoff: { runId: string; handoff: AgentHandoffView };
  /** v1.4：审查裁决（验收逐条结果 + 返工/通过理由） */
  agent_review: { runId: string; round: number; review: ReviewVerdictPayload };
  /** v1.4：预算实时快照（预算条驱动；触顶时终态另走 done/error） */
  agent_budget: { runId: string; usage: AgentBudgetUsage };
  /** v1.4：角色产出增量文本（可选；执行/规划思考流，非终态） */
  agent_delta: { runId: string; role: AgentRole; content: string };
  /**
   * v1.4 M4：协作链路工具授权请求。taskScope 为 task-loop 内 task run id，
   * 客户端「本任务内允许」时原样回传（remember=task 授权作用域）。
   */
  agent_tool_confirm: {
    runId: string;
    callId: string;
    tool: string;
    permission: PermissionLevel;
    argsSummary: string;
    taskScope: string;
  };
  /** v1.9 M3：一轮发言开始（按服务端校验后的顺序串行，舞台 focus 序列） */
  meeting_turn: {
    meetingId: string;
    mode: import('../schemas/meeting').MeetingMode;
    /** 本轮将依次发言的成员 id（manual=@ 序列；all=全成员；auto=接龙当前位） */
    speakerIds: string[];
    /** 已用 auto 接龙轮次 */
    autoRounds: number;
  };
  /** v1.9 M3：单成员发言流式增量（口型/字幕驱动；不代表落库） */
  meeting_delta: {
    meetingId: string;
    speakerId: string;
    /** 该成员本轮累计全文（非分片，随流更新） */
    content: string;
  };
  /** v1.9 M3：一条消息已落库（user/assistant，渲染归属以此为准，不采信正文自我宣称） */
  meeting_message: {
    meetingId: string;
    message: import('../types/meeting').MeetingMessageRecord;
  };
  /** v1.9 M3：会议状态机变更（mode 自动收回 manual / finished / aborted） */
  meeting_status: {
    meetingId: string;
    status: import('../schemas/meeting').MeetingStatus;
    mode: import('../schemas/meeting').MeetingMode;
    autoRounds: number;
  };
  /**
   * done：content 为已剥离情绪尾块的正文。
   * emotion 仅在情绪功能开启时附带（本轮解析后的情绪信号，含弱模型规则保底结果）；
   * 关闭情绪或主动搭话轮次不附带。
   */
  done: {
    content: string;
    usage: TokenUsage | null;
    emotion?: EmotionSignal;
  };
  /** v2.7：工作信号快照（桌宠/审批页独立订阅） */
  work_signal: WorkSignalSnapshot;
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
