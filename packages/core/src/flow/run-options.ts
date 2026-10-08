import type { FlowTrigger, FlowUnattendedPolicy } from '@wbfm/shared/types';
import type { WorkflowEndpointRepository } from '@wbfm/database';
import type { CompiledFlow } from './types';
import { computeReplayClosure } from './replay';

/**
 * v0.9 运行期附加参数（不入库版本、执行结束即清除）：
 * - api/mcp 的端点策略快照（建 run 时固化，执行期间端点改配置不影响本 run）；
 * - 重放祖先闭包与目标节点。
 */
export type RunRuntimeOverrides = Pick<
  import('./flow-execution').FlowExecutionParams,
  'unattendedPolicy' | 'onlyNodeIds' | 'replayTargetId'
>;

export interface ResolveOverridesParams {
  trigger: FlowTrigger;
  endpointId?: string | null;
  replay?: { parentRunId: string; resumedFromNode?: string };
  compiled: CompiledFlow;
  endpoints?: WorkflowEndpointRepository;
}

/**
 * 计算一次运行的附加参数：
 * - 节点重放 → 目标节点祖先闭包 + replayTargetId；
 * - api/mcp → 固化端点当前策略；端点/仓储缺失时安全兜底 deny_all。
 */
export function resolveRunRuntimeOverrides(params: ResolveOverridesParams): RunRuntimeOverrides {
  const overrides: RunRuntimeOverrides = {};
  if (params.replay?.resumedFromNode) {
    overrides.onlyNodeIds = computeReplayClosure(params.compiled, params.replay.resumedFromNode);
    overrides.replayTargetId = params.replay.resumedFromNode;
  }
  if ((params.trigger === 'api' || params.trigger === 'mcp') && params.endpointId) {
    const policy: FlowUnattendedPolicy =
      params.endpoints?.getById(params.endpointId)?.policy ?? { mode: 'deny_all' };
    overrides.unattendedPolicy = policy;
  }
  return overrides;
}
