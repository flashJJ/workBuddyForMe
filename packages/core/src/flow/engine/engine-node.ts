import type { FlowEventPayload } from '@wbfm/shared/types';
import type { FlowNodeType } from '@wbfm/shared/schemas';
import { toolNodeHandler, type ToolNodeConfig } from '../handlers/tool';
import { runAgentNode } from './engine-agent';
import { policyDenyText, type PolicyDecisionReason } from '../policy/policy-gate';
import type { FlowExecutionContext, FlowHandlerRegistry } from '../graph/types';

/**
 * 单节点执行体（v4.22 从 engine.ts 外迁，供串行与并行调度共用）：
 * human / tool / agent 需要执行中 yield（授权与交互时序），其余节点走处理器表。
 */

export type EventBase = { runId: string; workflowId: string };

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
