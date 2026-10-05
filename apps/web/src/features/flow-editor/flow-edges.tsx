'use client';

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { useFlowStatus } from './flow-status-context';

/**
 * 条件分支边：句柄 true→绿色「是」，false→红色「否」。
 * 校验诊断命中时红色虚线高亮。
 */
export function BranchEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
  selected,
}: EdgeProps) {
  const { errorEdgeIds } = useFlowStatus();
  const hasError = errorEdgeIds.has(id);
  const isTrue = sourceHandleId === 'true';
  const color = hasError ? '#ef4444' : isTrue ? '#10b981' : '#f87171';

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: selected ? 2.5 : 1.5,
          strokeDasharray: hasError ? '6 3' : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <span
          className={cn(
            'pointer-events-none absolute rounded px-1.5 py-0.5 text-[10px] font-medium',
            'bg-background border',
          )}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            color,
            borderColor: color,
          }}
        >
          {isTrue ? '是' : '否'}
        </span>
      </EdgeLabelRenderer>
    </>
  );
}

export const flowEdgeTypes = { branch: BranchEdge } as const;
