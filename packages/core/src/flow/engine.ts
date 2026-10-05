import type { FlowEventPayload, FlowNodeType } from '@wbfm/shared';
import { resolveFlowRefs } from './refs';
import { createDefaultHandlers } from './handlers';
import { toolNodeHandler, type ToolNodeConfig } from './handlers/tool';
import { buildIncomingIndex, isNodeLive } from './engine-live';
import { policyDenyText, type PolicyDecisionReason } from './policy-gate';
import type {
  CompiledFlow,
  FlowExecutionContext,
  FlowHandlerRegistry,
  FlowNodeState,
  FlowScope,
  RunFlowOptions,
} from './types';

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

/**
 * 工作流执行引擎（M1）：
 * - 按拓扑序顺序执行；condition 输出决定 true/false 分支边，未命中分支节点全部 skipped；
 * - human 节点内联挂起（先注册等待 → 发 node_waiting_human → await）；
 * - tool 节点统一解析 + write/danger 门控（同样的先注册/后发事件/再 await 时序）；
 * - 纯内存 AsyncGenerator；首个成功 end 决定 run_succeeded，全程支持 abort。
 */
export async function* runFlow(
  compiled: CompiledFlow,
  options: RunFlowOptions,
): AsyncGenerator<FlowEventPayload> {
  const runId = options.runId ?? '';
  const workflowId = options.workflowId;
  const base = { runId, workflowId };
  const handlers: FlowHandlerRegistry = { ...createDefaultHandlers(), ...options.handlers };
  const scope: FlowScope = new Map();
  const state = new Map<string, FlowNodeState>();
  /** condition 命中的分支边（其余出边视为不通） */
  const liveEdges = new Set<string>();
  const incomingById = buildIncomingIndex(compiled);

  const ctx: FlowExecutionContext = {
    signal: options.signal,
    input: options.input ?? {},
    scope,
    trigger: options.trigger ?? 'manual',
    interactive: options.interactive ?? true,
    ...options.context,
  };
  const aborted = () => options.signal?.aborted === true;

  yield { type: 'run_started', ...base, version: options.version, trigger: ctx.trigger };

  for (const nodeId of compiled.order) {
    if (aborted()) {
      yield { type: 'run_cancelled', ...base };
      return;
    }
    const node = compiled.nodesById.get(nodeId);
    if (!node) {
      yield { type: 'node_failed', ...base, nodeId, message: '节点在编译产物中不存在' };
      yield { type: 'run_failed', ...base, nodeId, message: '节点在编译产物中不存在' };
      return;
    }

    // ── v0.9 重放：祖先闭包之外的节点不执行（补发 skipped 观测事件） ──
    if (options.onlyNodeIds && !options.onlyNodeIds.has(nodeId)) {
      state.set(nodeId, 'skipped');
      yield { type: 'node_skipped', ...base, nodeId, reason: '不在本次重放的祖先闭包内' };
      continue;
    }

    // ── 活性判断：未命中分支链上的节点直接 skipped ──
    const live = isNodeLive(nodeId, compiled.startNodeId, incomingById, state, liveEdges, compiled);
    if (!live) {
      state.set(nodeId, 'skipped');
      yield { type: 'node_skipped', ...base, nodeId, reason: '所在分支未被条件命中' };
      continue;
    }

    // 执行前解析引用（模板插值 / $ref 整字段绑定）
    let resolvedConfig: Record<string, unknown>;
    try {
      resolvedConfig = resolveFlowRefs(node.config, scope) as Record<string, unknown>;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      state.set(nodeId, 'failed');
      yield { type: 'node_failed', ...base, nodeId, message };
      yield { type: 'run_failed', ...base, nodeId, message };
      return;
    }

    yield { type: 'node_started', ...base, nodeId, nodeType: node.type, inputs: resolvedConfig };

    try {
      let outputs: Record<string, unknown>;
      if (node.type === 'human') {
        outputs = yield* runHumanNode(nodeId, resolvedConfig, ctx, base);
      } else if (node.type === 'tool') {
        outputs = yield* runToolNodeWithGate(nodeId, resolvedConfig, ctx, base);
      } else {
        outputs = await runPlainNode(node.type, resolvedConfig, ctx, handlers);
      }
      if (aborted()) {
        yield { type: 'run_cancelled', ...base };
        return;
      }

      // 作用域统一形态：{ outputs: 节点产出 }；start 额外挂 params
      // （nodes.<id>.outputs.<字段> 引用约定；start 另有 nodes.start.params.<字段>）
      if (node.type === 'start') {
        scope.set(nodeId, { params: ctx.input, outputs: outputs ?? {} });
      } else {
        scope.set(nodeId, { outputs: outputs ?? {} });
      }
      state.set(nodeId, 'succeeded');

      // condition：激活命中分支边
      if (node.type === 'condition') {
        const branch = outputs.result === true ? 'true' : 'false';
        const selected = (compiled.successors.get(nodeId) ?? []).find((s) => s.handle === branch);
        if (selected) liveEdges.add(selected.edgeId);
      }

      yield { type: 'node_succeeded', ...base, nodeId, outputs };
      // v0.9 节点重放：目标节点执行完成即收尾（输出取目标节点，不要求连通到 end）
      if (options.replayTargetId && nodeId === options.replayTargetId && node.type !== 'end') {
        yield { type: 'run_succeeded', ...base, output: outputs.output ?? outputs ?? null };
        return;
      }
      if (node.type === 'end') {
        // 首个成功 end 收尾：其余未访问且不再导通的节点补发 skipped（观测完整性）
        for (const restId of compiled.order.slice(compiled.order.indexOf(nodeId) + 1)) {
          if (state.has(restId)) continue;
          if (
            !isNodeLive(restId, compiled.startNodeId, incomingById, state, liveEdges, compiled)
          ) {
            state.set(restId, 'skipped');
            yield {
              type: 'node_skipped',
              ...base,
              nodeId: restId,
              reason: '所在分支未被条件命中',
            };
          }
        }
        yield { type: 'run_succeeded', ...base, output: outputs.output ?? null };
        return;
      }
    } catch (err) {
      if (aborted()) {
        yield { type: 'run_cancelled', ...base };
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      state.set(nodeId, 'failed');
      yield { type: 'node_failed', ...base, nodeId, message };
      yield { type: 'run_failed', ...base, nodeId, message };
      return;
    }
  }

  yield {
    type: 'run_failed',
    ...base,
    message: '执行结束但未经过任何 end 节点（条件分支未连通到结束节点）',
  };
}

type EventBase = { runId: string; workflowId: string };

async function runPlainNode(
  type: FlowNodeType,
  config: Record<string, unknown>,
  ctx: FlowExecutionContext,
  handlers: FlowHandlerRegistry,
): Promise<Record<string, unknown>> {
  const handler = handlers[type];
  if (!handler) throw new Error(`节点类型「${type}」的处理器尚未注册`);
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
  void config;
  // 关键时序：Promise 必须在 yield 事件前创建（run-service 在调用时同步注册挂起项），
  // 否则消费者收到事件立刻提交会落空。
  const pending =
    ctx.interactive && ctx.requestHuman ? ctx.requestHuman(nodeId, config) : null;
  yield { type: 'node_waiting_human', ...base, nodeId };
  const decision = pending
          ? await pending
          : { approved: false, values: {} as Record<string, unknown> };
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
  if (!toolName) throw new Error('tool 节点未配置工具名');
  const tool = ctx.resolveTool ? await ctx.resolveTool(toolName) : null;
  if (!tool) throw new Error(`工具不存在或当前不可用：${toolName}`);

  const permission = tool.permission ?? 'read';
  let allowed = true;
  let denyReason: string | undefined;
  const unattended = ctx.trigger === 'api' || ctx.trigger === 'mcp';
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
