import type { FlowEventPayload } from '@wbfm/shared/types';
import type { FlowNode, FlowNodeType } from '@wbfm/shared/schemas';
import { resolveFlowNodePolicy } from '@wbfm/shared/schemas';
import { toolNodeHandler, type ToolNodeConfig } from '../handlers/tool';
import { runAgentNode } from './engine-agent';
import { policyDenyText, type PolicyDecisionReason } from '../policy/policy-gate';
import type { FlowExecutionContext, FlowHandlerRegistry } from '../graph/types';

/**
 * 单节点执行体（v4.22 从 engine.ts 外迁，供串行与并行调度共用）：
 * human / tool / agent 需要执行中 yield（授权与交互时序），其余节点走处理器表。
 */

export type EventBase = { runId: string; workflowId: string };

/** v4.23：确定性错误（配置/资源缺失），重试无意义 */
export class NonRetryableNodeError extends Error {}

export function isRetryableNodeError(error: unknown): boolean {
  return !(error instanceof NonRetryableNodeError);
}

function deniedToolOutput(toolName: string, permission: string, reason?: string): Record<string, unknown> {
  // v0.9 无人值守拒绝时 reason 携带 policy_* 说明（节点记录即审计轨迹）
  if (reason) {
    return { ok: false, output: reason, summary: '无人值守策略拒绝' };
  }
  return {
    ok: false,
    output: `工具 ${toolName} 未获得用户授权（权限级别：${permission}），已跳过执行。`,
    summary: '用户拒绝授权',
  };
}

async function runPlainNode(
  type: FlowNodeType,
  config: Record<string, unknown>,
  ctx: FlowExecutionContext,
  handlers: FlowHandlerRegistry,
): Promise<Record<string, unknown>> {
  const handler = handlers[type];
  if (!handler) throw new NonRetryableNodeError(`节点类型「${type}」的处理器尚未注册`);
  const result = await handler.run(config, ctx);
  return (result ?? {}) as Record<string, unknown>;
}

/** human 节点：先注册等待（回调内同步入表）→ 发事件 → await；非交互环境自动 approved:false */
async function* runHumanNode(
  nodeId: string,
  config: Record<string, unknown>,
  ctx: FlowExecutionContext,
  base: EventBase,
): AsyncGenerator<FlowEventPayload, Record<string, unknown>> {
  // 关键时序：Promise 必须在 yield 事件前创建（run-service 在调用时同步注册挂起项），
  // 否则消费者收到事件立刻提交会落空。
  const pending = ctx.interactive && ctx.requestHuman ? ctx.requestHuman(nodeId, config) : null;
  yield { type: 'node_waiting_human', ...base, nodeId };
  const decision = pending ? await pending : { approved: false, values: {} as Record<string, unknown> };
  return { approved: decision.approved, values: decision.values };
}

/** tool 节点：解析 → write/danger 门控（挂起确认）→ 执行；拒绝时产出 ok:false 不中断流程 */
async function* runToolNodeWithGate(
  nodeId: string,
  config: Record<string, unknown>,
  ctx: FlowExecutionContext,
  base: EventBase,
): AsyncGenerator<FlowEventPayload, Record<string, unknown>> {
  const toolConfig = config as ToolNodeConfig;
  const toolName = toolConfig.toolName?.trim() ?? '';
  if (!toolName) throw new NonRetryableNodeError('tool 节点未配置工具名');
  const tool = ctx.resolveTool ? await ctx.resolveTool(toolName) : null;
  if (!tool) throw new NonRetryableNodeError(`工具不存在或当前不可用：${toolName}`);

  const permission = tool.permission ?? 'read';
  let allowed = true;
  let denyReason: string | undefined;
  // v4.24：定时触发与 api/mcp 同属无人值守，写/危险工具默认拒绝
  const unattended =
    ctx.trigger === 'api' || ctx.trigger === 'mcp' || ctx.trigger === 'schedule';
  if (permission !== 'read') {
    if (unattended && ctx.evaluateUnattended) {
      // v0.9 无人值守：端点策略快照裁决，永不挂起等待人工
      const decision = ctx.evaluateUnattended(toolName, permission);
      allowed = decision.allowed;
      if (!allowed) denyReason = policyDenyText(decision.reason as PolicyDecisionReason, toolName);
    } else {
      allowed = (await ctx.checkToolAllowed?.(toolName, permission)) ?? false;
      if (!allowed) {
        // 同样遵循「先注册等待 → 发事件 → await」时序
        const pending =
          ctx.interactive && ctx.requestToolConfirmation
            ? ctx.requestToolConfirmation({
                nodeId,
                toolName,
                permission,
                argsSummary: JSON.stringify(toolConfig.args ?? {}).slice(0, 200),
              })
            : null;
        yield { type: 'node_waiting_human', ...base, nodeId };
        allowed = pending ? await pending : false;
      }
    }
  }
  if (!allowed) return deniedToolOutput(toolName, permission, denyReason);

  const result = await toolNodeHandler.run(
    config as unknown as ToolNodeConfig,
    { ...ctx, activeTool: tool },
  );
  return result as Record<string, unknown>;
}

/** 按节点类型分派执行，返回节点产出（供作用域写入与下游引用） */
export async function* runNodeBody(
  nodeId: string,
  type: FlowNodeType,
  config: Record<string, unknown>,
  ctx: FlowExecutionContext,
  handlers: FlowHandlerRegistry,
  base: EventBase,
): AsyncGenerator<FlowEventPayload, Record<string, unknown>> {
  if (type === 'human') return yield* runHumanNode(nodeId, config, ctx, base);
  if (type === 'tool') return yield* runToolNodeWithGate(nodeId, config, ctx, base);
  if (type === 'agent') return yield* runAgentNode(nodeId, config, ctx, base);
  return runPlainNode(type, config, ctx, handlers);
}

/* ───────────────── v4.23 节点尝试：重试与超时（串行/并行共用） ───────────────── */

export interface NodeAttemptArgs {
  nodeId: string;
  node: FlowNode;
  config: Record<string, unknown>;
  ctx: FlowExecutionContext;
  handlers: FlowHandlerRegistry;
  base: EventBase;
}

export type NodeAttemptResult =
  | { ok: true; outputs: Record<string, unknown>; attempt: number; durationMs: number }
  | { ok: false; attempt: number; message: string; aborted: boolean };

const DEFAULT_BACKOFF_MS = 1_000;
const DEFAULT_MAX_BACKOFF_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number, nodeId: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`节点 ${nodeId} 执行超时（${ms}ms）`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener('abort', finish, { once: true });
  });
}

/** 超时只对非交互节点生效；写/危险 tool 与 human/agent 不设超时 */
async function resolveTimeoutMs(
  args: NodeAttemptArgs,
  timeoutMs: number | undefined,
): Promise<number | null> {
  if (!timeoutMs) return null;
  const { node, config, ctx } = args;
  if (node.type === 'human' || node.type === 'agent' || node.type === 'start') return null;
  if (node.type !== 'tool') return timeoutMs;
  const toolName = String((config as { toolName?: unknown }).toolName ?? '').trim();
  if (!toolName || !ctx.resolveTool) return null;
  try {
    const tool = await ctx.resolveTool(toolName);
    return (tool?.permission ?? 'read') === 'read' ? timeoutMs : null;
  } catch {
    return null;
  }
}

async function* runAttempt(
  args: NodeAttemptArgs,
  timeoutMs: number | null,
): AsyncGenerator<FlowEventPayload, Record<string, unknown>> {
  const iterator = runNodeBody(args.nodeId, args.node.type, args.config, args.ctx, args.handlers, args.base);
  for (;;) {
    const step =
      timeoutMs === null
        ? await iterator.next()
        : await withTimeout(iterator.next(), timeoutMs, args.nodeId);
    if (step.done) return step.value;
    yield step.value;
  }
}

/**
 * 按节点策略执行：每次尝试发 node_started（重试带 attempt）；
 * 仅对执行体抛出的可重试错误按指数退避重试，不抛错而是返回结果。
 */
export async function* runNodeWithPolicy(
  args: NodeAttemptArgs,
): AsyncGenerator<FlowEventPayload, NodeAttemptResult> {
  const policy = resolveFlowNodePolicy(args.config);
  const maxAttempts = policy.retry?.maxAttempts ?? 1;
  const backoffMs = policy.retry?.backoffMs ?? DEFAULT_BACKOFF_MS;
  const maxBackoffMs = policy.retry?.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  const timeoutMs = await resolveTimeoutMs(args, policy.timeoutMs);

  let attempt = 0;
  for (;;) {
    attempt += 1;
    const startedAt = Date.now();
    yield {
      type: 'node_started',
      ...args.base,
      nodeId: args.nodeId,
      nodeType: args.node.type,
      inputs: args.config,
      ...(attempt > 1 ? { attempt } : {}),
    };
    try {
      const outputs = yield* runAttempt(args, timeoutMs);
      return { ok: true, outputs, attempt, durationMs: Date.now() - startedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const aborted = args.ctx.signal?.aborted === true;
      if (aborted || attempt >= maxAttempts || !isRetryableNodeError(error)) {
        return { ok: false, attempt, message, aborted };
      }
      const waitMs = Math.min(backoffMs * 2 ** (attempt - 1), maxBackoffMs);
      await sleepWithAbort(waitMs, args.ctx.signal);
      if (args.ctx.signal?.aborted) return { ok: false, attempt, message, aborted: true };
    }
  }
}
