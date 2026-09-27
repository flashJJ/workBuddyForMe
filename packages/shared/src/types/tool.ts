/**
 * 工具名：v0.6 起为开放式字符串（内置名或 mcp:<server>:<tool> 命名空间），
 * TOOL_NAMES 枚举仅供内置工具的 UI 标签映射使用。
 */

/** 工具调用状态（running 仅用于前端流式过程，落库后只会是 ok/error） */
export type ToolCallStatus = 'running' | 'ok' | 'error';

/**
 * 落库的工具调用轨迹（messages.tool_trace JSON）。
 * 只存展示与审计所需摘要，不存完整网页正文等大块内容。
 */
export interface ToolTraceEntry {
  callId: string;
  tool: string;
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
      tool: string;
      argsSummary: string;
    }
  | {
      phase: 'end';
      callId: string;
      tool: string;
      status: ToolCallStatus;
      durationMs: number;
      resultSummary: string;
      error?: string;
    };
