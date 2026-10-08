import type { ChatMessage, ToolCall, TraceHandle } from '@wbfm/ai';
import type { Citation, ToolTraceEntry } from '@wbfm/shared/types';
import type { ServiceDeps } from '../services/deps';
import type { ToolContext, ToolMap } from '../tools/types';
import type { ToolRuntime } from '../tools/tool-runtime';

export interface ToolCallLoopParams {
  calls: ToolCall[];
  toolMap: ToolMap;
  toolCtx: ToolContext;
  deps: ServiceDeps;
  /** v0.6 M4：工具运行时（用于 resolveTool 获取 source） */
  runtime: ToolRuntime;
  assistantId: string;
  /** v0.7 M2：任务作用域（对话 id / 任务运行 id），用于 remember='task' 批量授权 */
  taskScope?: string;
  turnTrace: TraceHandle | null;
  /** 工具调用追踪（本函数会 push 条目） */
  trace: ToolTraceEntry[];
  /** 出站消息（本函数会 push tool 结果消息） */
  outgoing: ChatMessage[];
  citations: Citation[];
  signal?: AbortSignal;
  /** v1.1：每条工具消息的入模 token 预算（context-budget 装配时下发） */
  toolMessageBudgetTokens: number;
  /** 中断收尾：stopMessage + saveMessageToolTrace（由编排器注入） */
  onAbort: () => void;
}

export interface ToolCallLoopOutcome {
  /** true=处理中断，调用方应 yield done 并 return */
  aborted: boolean;
  citations: Citation[];
}
