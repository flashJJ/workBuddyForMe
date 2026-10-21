import type { Message, PermissionLevel } from '@wbfm/shared/types';
import type { RecalledMemoryPayload, SsePayloadMap } from '@wbfm/shared/api';
import type { AgentCardEntry } from '../agent-collab';

/** v0.6 M2：待用户确认的工具调用（HITL 弹窗数据源） */
export interface PendingToolConfirmation {
  callId: string;
  tool: string;
  permission: PermissionLevel;
  argsSummary: string;
  /**
   * v1.4 M4：协作 Executor 门控帧携带的 task run 作用域。
   * 存在即表示请求来自协作链路（弹窗标注「协作任务·Executor 发起」）；
   * remember=task 时原样回传作为授权作用域。
   */
  taskScope?: string;
}

/** v1.0：语音接线（朗读开关 + 音频帧/状态回调），由对话页注入播放队列 */
export interface ChatSessionVoice {
  ttsEnabled: boolean;
  onAudio?: (frame: SsePayloadMap['voice_audio']) => void;
  onVoiceState?: (state: SsePayloadMap['voice_state']) => void;
  /** 停止/重置时中断播放 */
  cancelPlayback?: () => void;
}

/** v2.4 M5：单轮流式计时（首字/落定均为本地时钟，用于进度与体感指标） */
export interface StreamTiming {
  startedAt: number;
  firstTokenAt: number | null;
  settledAt: number | null;
}

/** 对话会话对外契约（use-chat-session 的实现返回此接口） */
export interface ChatSession {
  messages: Message[];
  streaming: boolean;
  /** 当前轮的首字/落定计时；新一轮开始时重置 */
  streamTiming: StreamTiming | null;
  /** 本轮召回的长期记忆（回答上方「参考了 N 条记忆」提示），下轮开始时清空 */
  recalledMemories: RecalledMemoryPayload[];
  /** v0.6 M2：当前待确认的工具调用（null=无弹窗） */
  pendingConfirmation: PendingToolConfirmation | null;
  /** v1.4 任务模式：消息内协作泳道卡（live only） */
  agentCards: Record<string, AgentCardEntry>;
  send: (content: string, attachmentIds?: string[]) => void;
  /** v1.4 任务模式：发起一次三角色协作（与会话关联），泳道卡内联在消息流 */
  sendTask: (content: string, options?: { regenerate?: boolean }) => Promise<void>;
  /** 重新生成最后一条助手回复（沿用上一条用户消息） */
  retry: () => void;
  stop: () => void;
  /** 切换会话/助手时清空本地流式视图，回到服务端历史 */
  reset: () => void;
  /** 反馈提交成功后同步到本地 live 视图（live 为空时由 React Query 刷新生效） */
  applyFeedback: (messageId: string, feedback: Message['feedback'], feedbackAt: string | null) => void;
  /** v0.6 M2：提交工具确认决策；返回 false 表示提交失败（调用方提示并保持弹窗） */
  confirmTool: (action: 'allow' | 'deny', remember?: 'assistant' | 'all' | 'task') => Promise<boolean>;
}
