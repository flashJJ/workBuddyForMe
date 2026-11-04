'use client';

import * as React from 'react';
import type { RunGraphEdge, RunGraphLane, RunGraphNode } from '@wbfm/shared/types';
import { lightColor, type Point } from '@/components/ui/light-layer';

interface EdgePath {
  id: string;
  from: string;
  to: string;
  d: string;
  target: Point;
  color: string;
  active: boolean;
  handoff: boolean;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  cx: number;
  cy: number;
}

const HANDOFF_EDGES = new Set<string>(['round_to_handoff']);
const ACTIVE_STATUSES = new Set<string>(['queued', 'running', 'waiting']);
const RAIL_GAP = 12;

/** 左侧留出连线槽：从卡片左边缘出发，经车道竖轨拐入目标卡片。 */
function railPath(a: Box, b: Box): { d: string; target: Point } {
  const from = { x: a.left, y: a.cy };
  const to = { x: b.left, y: b.cy };
  const railX = Math.min(a.left, b.left) - RAIL_GAP;
  return {
    d: `M ${from.x} ${from.y} C ${railX} ${from.y}, ${railX} ${to.y}, ${to.x} ${to.y}`,
    target: to,
  };
}

export interface RunGraphEdgesProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  nodes: readonly RunGraphNode[];
  lanes: readonly RunGraphLane[];
  edges: readonly RunGraphEdge[];
  /** 折叠/聚焦/详情变化后强制重测 */
  layoutKey: string;
  selectedId: string | null;
}

/** v2.20 M3 / v2.22：车道色曲线 + 活跃边流动 + 交接虚线；隐藏节点自动跳过。 */
export function RunGraphEdges({
  containerRef,
  nodes,
  lanes,
  edges,
  layoutKey,
  selectedId,
}: RunGraphEdgesProps) {
  const [paths, setPaths] = React.useState<EdgePath[]>([]);

  React.useLayoutEffect(() => {
    let container: HTMLDivElement | null = null;
    let frame = 0;
    let retryTimer = 0;
    let settleTimer = 0;
    let attempts = 0;
    let observer: ResizeObserver | null = null;
    let mutation: MutationObserver | null = null;

    const measure = () => {
      if (!container) return;
      const origin = container.getBoundingClientRect();
      const boxes = new Map<string, Box>();
      container.querySelectorAll<HTMLElement>('[data-graph-node-id]').forEach((element) => {
        const id = element.dataset.graphNodeId;
        if (!id) return;
        const rect = element.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        const left = rect.left - origin.left;
        const top = rect.top - origin.top;
        boxes.set(id, {
          left,
          top,
          right: left + rect.width,
          bottom: top + rect.height,
          cx: left + rect.width / 2,
          cy: top + rect.height / 2,
        });
      });

      const nodesById = new Map(nodes.map((node) => [node.id, node]));
      const laneToken = new Map(lanes.map((lane) => [lane.id, lane.colorToken]));
      const next: EdgePath[] = [];
      for (const edge of edges) {
        const fromBox = boxes.get(edge.from);
        const toBox = boxes.get(edge.to);
        if (!fromBox || !toBox) continue;
        const fromNode = nodesById.get(edge.from);
        const toNode = nodesById.get(edge.to);
        const lane = laneToken.get(toNode?.laneId ?? fromNode?.laneId ?? '');
        const handoff = HANDOFF_EDGES.has(edge.kind);
        const active =
          ACTIVE_STATUSES.has(fromNode?.status ?? '') || ACTIVE_STATUSES.has(toNode?.status ?? '');
        const rail = railPath(fromBox, toBox);
        next.push({
          id: edge.id,
          from: edge.from,
          to: edge.to,
          d: rail.d,
          target: rail.target,
          color: handoff ? 'accent' : lane ?? 'muted-foreground',
          active,
          handoff,
        });
      }
      setPaths(next);
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    const start = () => {
      container = containerRef.current;
      if (!container || typeof ResizeObserver === 'undefined') {
        // 面板首次打开时 ref 可能尚未赋值；短轮询重试，避免永久空白。
        if (!container && attempts < 20) {
          attempts += 1;
          retryTimer = window.setTimeout(start, 50);
        }
        return;
      }
      measure();
      // 首次挂载时节点可能尚未完成布局；下一帧与定时器各补一次。
      schedule();
      settleTimer = window.setTimeout(measure, 80);
      observer = new ResizeObserver(schedule);
      observer.observe(container);
      mutation = new MutationObserver(schedule);
      mutation.observe(container, { subtree: true, childList: true, attributes: true });
      window.addEventListener('resize', schedule);
    };

    start();
    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (settleTimer) clearTimeout(settleTimer);
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      mutation?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [containerRef, nodes, lanes, edges, layoutKey]);

  return (
    <svg
      aria-hidden="true"
      data-testid="run-graph-edges"
      data-edge-count={paths.length}
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
    >
      {paths.map((path) => {
        const highlighted = selectedId !== null && (path.from === selectedId || path.to === selectedId);
        const color = lightColor(path.color);
        const width = highlighted ? 2.1 : path.active ? 1.7 : 1.4;
        const opacity = highlighted ? 1 : path.active ? 0.85 : 0.55;
        return (
          <g key={path.id} data-edge-id={path.id}>
            <path
              d={path.d}
              className="run-graph-edge-glow"
              style={{
                stroke: color,
                strokeWidth: width * 2.6,
                opacity: highlighted ? 0.24 : path.active || path.handoff ? 0.16 : 0.08,
              }}
            />
            <path
              d={path.d}
              className="run-graph-edge"
              pathLength={1}
              style={{ stroke: color, strokeWidth: width, opacity }}
            />
            {(path.active || path.handoff) && (
              <path
                d={path.d}
                className={path.handoff ? 'run-graph-edge-handoff' : 'run-graph-edge-active'}
                style={{ stroke: color, strokeWidth: width + 0.4 }}
              />
            )}
            <circle
              cx={path.target.x}
              cy={path.target.y}
              r={highlighted ? 3 : 2.2}
              fill={color}
              opacity={highlighted ? 1 : 0.7}
            />
          </g>
        );
      })}
    </svg>
  );
}
