import type { NodeExecutionView, WorkflowRunView } from '@wbfm/shared/types';
import type { Tool } from '../../tools/types';
import type { CompiledFlow } from '../graph/types';

/**
 * v4.23 启动恢复安全矩阵（纯函数）：
 * 只判断「这次中断能否自动续跑」，不读写数据库。
 */

export type ResumeReason = 'waiting_human' | 'safe_in_flight' | 'empty_checkpoint';

export type ResumeRejectReason =
  | 'unsafe_in_flight'
  | 'version_missing'
  | 'chat_request_gone'
  | 'already_active';

export type ResumeDecision =
  | { eligible: true; reason: ResumeReason; unsafeNodeId?: string }
  | { eligible: false; reason: ResumeRejectReason; nodeId?: string };

export interface DecideResumeParams {
  run: WorkflowRunView;
  nodes: NodeExecutionView[];
  compiled: CompiledFlow | null;
  /** 当前编译产物对应的版本号（用于与运行固定版本比对） */
  compiledVersion: number | null;
  activeRunIds: ReadonlySet<string>;
  resolveTool?: (name: string) => Tool | null;
}

/** 在途安全类型：与并行白名单一致（写/危险 tool 由 resolveTool 判定） */
function isSafeInFlight(
  nodeId: string,
  compiled: CompiledFlow,
  resolveTool?: (name: string) => Tool | null,
): boolean {
  const node = compiled.nodesById.get(nodeId);
  if (!node) return false;
  if (node.type === 'start') return true;
  if (node.type === 'human' || node.type === 'agent') return false;
  if (node.type !== 'tool') return true;
  const toolName = String((node.config as { toolName?: unknown }).toolName ?? '').trim();
  if (!toolName || !resolveTool) return false;
  try {
    return (resolveTool(toolName)?.permission ?? 'write') === 'read';
  } catch {
    return false;
  }
}

export function decideResume(params: DecideResumeParams): ResumeDecision {
  const { run, nodes, compiled, compiledVersion, activeRunIds, resolveTool } = params;
  if (activeRunIds.has(run.id)) return { eligible: false, reason: 'already_active' };
  if (run.trigger === 'chat') return { eligible: false, reason: 'chat_request_gone' };
  if (!compiled || compiledVersion === null || compiledVersion !== run.version) {
    return { eligible: false, reason: 'version_missing' };
  }

  // 等待人工的运行没有副作用在途：直接续跑并重新进入等待
  if (run.status === 'waiting_human') return { eligible: true, reason: 'waiting_human' };

  const running = nodes.filter((node) => node.status === 'running');
  for (const node of running) {
    if (!isSafeInFlight(node.nodeId, compiled, resolveTool)) {
      return { eligible: false, reason: 'unsafe_in_flight', nodeId: node.nodeId };
    }
  }
  if (nodes.some((node) => node.status === 'failed')) {
    return { eligible: false, reason: 'unsafe_in_flight' };
  }
  if (running.length > 0) return { eligible: true, reason: 'safe_in_flight' };
  if (nodes.length === 0) return { eligible: true, reason: 'empty_checkpoint' };
  // 全部节点已落定但运行未收敛：等价为空检查点，由引擎按 end/无 end 收尾
  return { eligible: true, reason: 'empty_checkpoint' };
}
