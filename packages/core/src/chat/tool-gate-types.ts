import type { ChatMessage } from '@wbfm/ai';
import type { PermissionLevel, ToolTraceEntry } from '@wbfm/shared/types';
import type { AgentPermissionMode, AgentPolicy } from '@wbfm/shared/schemas';
import type { ServiceDeps } from '../services/deps';
import type { Tool } from '../tools/types';

/** v2.13 M3：门控类型外迁（守住 300 行门禁；对外仍从 tool-permission-gate 再导出） */

export interface ApprovalContext {
  runId?: string | null;
  conversationId?: string | null;
  deepLink: string;
}

export interface ToolGateParams {
  deps: ServiceDeps;
  tool: Tool | undefined;
  toolName: string;
  callId: string;
  argsSummary: string;
  assistantId: string;
  signal?: AbortSignal;
  /** v0.6 M4：工具来源标识 */
  source: string;
  /** v0.6 M4：权限级别（调用方已解析，避免重复查 tool?.permission） */
  permission: PermissionLevel;
  /** v0.7 M2：任务作用域（对话 id / 任务运行 id），用于 remember='task' 批量授权 */
  taskScope?: string;
  /** v2.7：审批中心深链与运行归属 */
  approvalContext?: ApprovalContext;
  /** v2.13：原始参数（审批绑定需要；缺省时按空对象） */
  args?: unknown;
  /** v2.13：本次运行模式（缺省取策略 defaultMode） */
  mode?: AgentPermissionMode;
  /** v2.13：工作目录（realpath 归一化后） */
  workspacePath?: string | null;
  /** v2.13：调用方已解析的策略（缺省读 deps.agentPolicy） */
  policy?: AgentPolicy;
}

export interface ToolGateResult {
  denied: boolean;
  /** denied=true 时已生成的拒绝 trace 条目（调用方负责 push） */
  traceEntry?: ToolTraceEntry;
  /** denied=true 时回灌给模型的「用户拒绝」tool 消息（调用方负责 push 到出站消息） */
  toolMessage?: ChatMessage;
}
