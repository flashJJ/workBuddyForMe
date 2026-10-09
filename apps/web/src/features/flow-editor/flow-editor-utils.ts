import type { FlowDiagnostic } from '@wbfm/shared/types';
import type { FlowInputField } from '@wbfm/shared/schemas';
import type { FlowLiveState } from '@/lib/hooks/use-flows';
import type { FlowStatusContextValue } from './flow-status-context';
import type { FlowCanvasNode } from './graph-utils';

/** 从 start 节点配置读取试运行输入字段定义 */
export function selectStartFields(nodes: FlowCanvasNode[]): FlowInputField[] {
  const start = nodes.find((n) => n.type === 'start');
  return Array.isArray(start?.data.config.inputs)
    ? (start!.data.config.inputs as FlowInputField[])
    : [];
}

/** 由诊断列表 + 运行态构建下发给画布的状态 context 值 */
export function buildFlowStatusValue(
  diagnostics: FlowDiagnostic[] | null,
  nodeStatus: FlowLiveState['nodeStatus'],
): FlowStatusContextValue {
  return {
    nodeStatus,
    errorNodeIds: new Set(
      (diagnostics ?? []).filter((d) => d.severity === 'error' && d.nodeId).map((d) => d.nodeId!),
    ),
    warningNodeIds: new Set(
      (diagnostics ?? []).filter((d) => d.severity === 'warning' && d.nodeId).map((d) => d.nodeId!),
    ),
    errorEdgeIds: new Set(
      (diagnostics ?? []).filter((d) => d.edgeId).map((d) => d.edgeId!),
    ),
  };
}
