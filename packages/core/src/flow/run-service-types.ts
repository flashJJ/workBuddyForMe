import {
  type FlowEventPayload,
  type FlowTrigger,
  type WorkflowRunView,
} from '@wbfm/shared/types';
import { type FlowHumanSubmitInput } from '@wbfm/shared/schemas';
import type {
  WorkflowEndpointRepository,
  WorkflowRepository,
  WorkflowRunRepository,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import type { ToolRuntime } from '../tools/tool-runtime';
import type { Tool } from '../tools/types';
import type { FlowWaitRegistry } from './wait-registry';

export interface FlowRunServiceDeps {
  deps: ServiceDeps;
  runtime: ToolRuntime;
  workflows: WorkflowRepository;
  runs: WorkflowRunRepository;
  waiters?: FlowWaitRegistry;
  /** v0.9：读取端点策略快照（api/mcp 运行门控）；内部路由/测试可不传 */
  endpoints?: WorkflowEndpointRepository;
}

export interface CreateRunParams {
  workflowId: string;
  input?: Record<string, unknown>;
  trigger?: FlowTrigger;
  conversationId?: string | null;
  endpointId?: string | null;
  /** v0.9 重放：关联原运行；resumedFromNode 存在时为祖先闭包节点重放，否则整体重跑 */
  replay?: { parentRunId: string; resumedFromNode?: string };
}

export interface FlowRunService {
  /** 登记 queued 运行（校验图 + 建记录）；manual/api/mcp 自动入队，chat 由 invokeFromChat 直接执行 */
  createRun(params: CreateRunParams): string;
  /** 显式入队（恢复扫描等内部场景；重复调用幂等） */
  enqueueRun(runId: string): void;
  /**
   * 只读订阅运行事件（不影响执行生命周期）：
   * 本进程有事件缓冲（进行中或刚终态）→ 返回生成器（先补历史再接实时）；
   * 进程重启后的终态运行无缓冲 → 返回 null，调用方改从 node_executions 回放。
   */
  subscribeRunEvents(runId: string, observerSignal?: AbortSignal):
    | AsyncGenerator<FlowEventPayload>
    | null;
  /**
   * 等待运行进入终态（公开 API 同步调用 / MCP tools/call 复用）：
   * 纯等待者，不占用队列执行者，也不影响运行生命周期。
   * 超时返回 timedOut（运行继续，调用方转异步语义）。
   */
  waitForTerminal(
    runId: string,
    timeoutMs: number,
  ): Promise<{ timedOut: boolean; run: WorkflowRunView | null }>;
  submitHuman(runId: string, nodeId: string, body: FlowHumanSubmitInput): boolean;
  submitToolConfirmation(runId: string, nodeId: string, allowed: boolean): boolean;
  cancel(runId: string): boolean;
  isActive(runId: string): boolean;
  activeRunIds(): string[];
  resolveAsTool(workflowId: string): Tool | null;
  listPublishedTools(): Tool[];
}
