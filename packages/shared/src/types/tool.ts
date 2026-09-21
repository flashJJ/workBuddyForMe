import type { ToolName } from '../constants';

/** 工具调用状态（running 仅用于前端流式过程，落库后只会是 ok/error） */
export type ToolCallStatus = 'running' | 'ok' | 'error';

/**
 * 落库的工具调用轨迹（messages.tool_trace JSON）。
 * 只存展示与审计所需摘要，不存完整网页正文等大块内容。
 */
export interface ToolTraceEntry {
  callId: string;
  tool: ToolName;
  argsSummary: string;
  status: ToolCallStatus;
  durationMs: number;
  resultSummary: string;
  error?: string;
  startedAt: string;
}

/** SSE tool 事件载荷：start 与 end 两阶段，前端据此渲染过程卡片 */
export type ToolEventPayload =
  | {
      phase: 'start';
      callId: string;
      tool: ToolName;
      argsSummary: string;
    }
  | {
      phase: 'end';
      callId: string;
      tool: ToolName;
      status: ToolCallStatus;
      durationMs: number;
      resultSummary: string;
      error?: string;
    };
