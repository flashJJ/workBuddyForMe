'use client';

import * as React from 'react';
import type { FlowNodeExecStatus } from '@wbfm/shared';

/**
 * 画布运行态/诊断态通过 context 下发，避免每次试运行都重建
 * React Flow 的 nodes 数组（保持 React Flow 内部受控状态稳定）。
 */
export interface FlowStatusContextValue {
  /** nodeId → 执行状态（试运行面板驱动） */
  nodeStatus: Record<string, FlowNodeExecStatus>;
  /** 校验诊断命中的节点/边（红框定位） */
  errorNodeIds: ReadonlySet<string>;
  warningNodeIds: ReadonlySet<string>;
  errorEdgeIds: ReadonlySet<string>;
}

export const FlowStatusContext = React.createContext<FlowStatusContextValue>({
  nodeStatus: {},
  errorNodeIds: new Set(),
  warningNodeIds: new Set(),
  errorEdgeIds: new Set(),
});

export function useFlowStatus() {
  return React.useContext(FlowStatusContext);
}
