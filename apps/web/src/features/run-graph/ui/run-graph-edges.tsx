'use client';

import * as React from 'react';
import type { RunGraphEdge } from '@wbfm/shared/types';
import { buildCurve, curvePath, seedFromString } from '@/components/ui/light-layer';

interface EdgePath {
  id: string;
  from: string;
  to: string;
  d: string;
}

export interface RunGraphEdgesProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  edges: readonly RunGraphEdge[];
  /** 折叠/聚焦/详情变化后强制重测 */
  layoutKey: string;
  selectedId: string | null;
}

/** v2.20 M3：在可见节点卡片之间绘制曲线；隐藏/折叠节点自动跳过。 */
export function RunGraphEdges({ containerRef, edges, layoutKey, selectedId }: RunGraphEdgesProps) {
  const [paths, setPaths] = React.useState<EdgePath[]>([]);

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const measure = () => {
      const origin = container.getBoundingClientRect();
      const positions = new Map<string, { x: number; y: number }>();
      container.querySelectorAll<HTMLElement>('[data-graph-node-id]').forEach((element) => {
        const id = element.dataset.graphNodeId;
        if (!id) return;
        const rect = element.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        positions.set(id, {
          x: rect.left - origin.left + rect.width / 2,
          y: rect.top - origin.top + rect.height / 2,
        });
      });

      const next: EdgePath[] = [];
      for (const edge of edges) {
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        if (!from || !to) continue;
        const curve = buildCurve(from, to, seedFromString(edge.id), 0.08);
        next.push({ id: edge.id, from: edge.from, to: edge.to, d: curvePath(curve) });
      }
      setPaths(next);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [containerRef, edges, layoutKey]);

  return (
    <svg
      aria-hidden="true"
      data-testid="run-graph-edges"
      data-edge-count={paths.length}
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
    >
      {paths.map((path) => {
        const highlighted = selectedId !== null && (path.from === selectedId || path.to === selectedId);
        return (
          <path
            key={path.id}
            d={path.d}
            fill="none"
            style={{
              stroke: highlighted ? 'hsl(var(--primary) / 0.75)' : 'hsl(var(--muted-foreground) / 0.3)',
              strokeWidth: highlighted ? 1.5 : 1,
            }}
          />
        );
      })}
    </svg>
  );
}
