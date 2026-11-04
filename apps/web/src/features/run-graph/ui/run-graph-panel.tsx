'use client';

import * as React from 'react';
import type { RunGraphRootKind } from '@wbfm/shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useRunGraph } from '../hooks/use-run-graph';
import { RunGraphEdges } from './run-graph-edges';
import { RunGraphNodeCard, RunGraphNodeDetail } from './run-graph-node-card';
import { nodeElement, lightTokenForLane, resolveSourceAnchor } from './run-graph-anchors';
import { useRunGraphLight } from './use-run-graph-light';

const LANE_DOT: Record<string, string> = {
  primary: 'bg-primary',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  accent: 'bg-accent',
  destructive: 'bg-destructive',
};

export interface RunGraphPanelProps {
  kind: RunGraphRootKind;
  id: string | null;
  className?: string;
  compact?: boolean;
  /** 聊天/会议侧开启实时帧与光线；timeline 保持快照 */
  live?: boolean;
  onClose?: () => void;
}

/** v2.20：只读过程图（车道 + 节点 + 边 + 实时光线）；同一组件供会话/会议复用。 */
export function RunGraphPanel({
  kind,
  id,
  className,
  compact = false,
  live = false,
  onClose,
}: RunGraphPanelProps) {
  const { t } = useI18n();
  const query = useRunGraph(kind, id, { live });
  const [focusLane, setFocusLane] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = React.useState<string | null>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const knownNodeIds = React.useRef<Set<string> | null>(null);
  const archivedLanes = React.useRef<Set<string>>(new Set());
  const emitLight = useRunGraphLight(live && Boolean(id));

  const scopeKey = `${kind}:${id ?? ''}`;
  React.useEffect(() => {
    knownNodeIds.current = null;
    archivedLanes.current.clear();
  }, [scopeKey]);

  // v2.21：归档分支车道首次出现时默认折叠；手动展开后不在轮询中重新折叠
  React.useEffect(() => {
    const snapshot = query.data;
    if (!snapshot) return;
    const current = new Set<string>();
    const fresh: string[] = [];
    for (const lane of snapshot.lanes) {
      if (lane.kind !== 'branch' || !lane.archived) continue;
      current.add(lane.id);
      if (!archivedLanes.current.has(lane.id)) fresh.push(lane.id);
    }
    archivedLanes.current = current;
    if (fresh.length === 0) return;
    setCollapsed((prev) => new Set([...prev, ...fresh]));
  }, [query.data]);

  React.useEffect(() => {
    const snapshot = query.data;
    if (!live || !snapshot || snapshot.rootId !== id) return;
    if (!knownNodeIds.current) {
      knownNodeIds.current = new Set(snapshot.nodes.map((node) => node.id));
      return;
    }
    const fresh = snapshot.nodes.filter((node) => !knownNodeIds.current!.has(node.id));
    if (fresh.length === 0) return;
    for (const node of fresh) knownNodeIds.current.add(node.id);

    const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]));
    const rootNodeId =
      snapshot.nodes.find((node) => node.kind === 'root')?.id ??
      `root:${snapshot.rootKind}:${snapshot.rootId}`;
    for (const node of fresh) {
      const lane = snapshot.lanes.find((item) => item.id === node.laneId);
      emitLight({
        id: `light:${snapshot.rootId}:${node.id}`,
        source: resolveSourceAnchor(node, nodesById, rootNodeId),
        target: () => nodeElement(node.id),
        color: lightTokenForLane(lane?.colorToken),
      });
    }
  }, [query.data, live, id, emitLight]);

  if (!id) return <EmptyState title={t('runGraph.empty')} />;
  if (query.isLoading) {
    return (
      <div className={cn('flex items-center justify-center p-6', className)}>
        <Spinner />
      </div>
    );
  }
  if (query.isError && !query.data) {
    return (
      <div className={cn('p-3', className)}>
        <ErrorState message={t('runGraph.loadFailed')} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const snapshot = query.data;
  const lanes = snapshot?.lanes ?? [];
  const visibleLanes = focusLane ? lanes.filter((lane) => lane.id === focusLane) : lanes;
  const selectedNode = snapshot?.nodes.find((node) => node.id === selected) ?? null;
  const toggleCollapse = (laneId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(laneId)) next.delete(laneId);
      else next.add(laneId);
      return next;
    });
  };
  const layoutKey = `${focusLane ?? ''}|${[...collapsed].sort().join(',')}|${snapshot?.nodes.length ?? 0}|${snapshot?.edges.length ?? 0}`;

  return (
    <section
      className={cn('flex min-h-0 flex-col rounded-lg border bg-card', className)}
      data-testid="run-graph-panel"
      data-root-kind={kind}
      data-live={live ? '1' : '0'}
    >
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <span className="text-sm font-semibold">{t('runGraph.title')}</span>
        {snapshot && (
          <Badge variant="outline">{t('runGraph.nodeCount', { count: snapshot.nodes.length })}</Badge>
        )}
        {focusLane && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setFocusLane(null)}>
            {t('runGraph.allLanes')}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
            data-testid="run-graph-refresh"
          >
            {t('runGraph.refresh')}
          </Button>
          {onClose && (
            <Button type="button" size="sm" variant="ghost" onClick={onClose} aria-label={t('runGraph.close')}>
              ×
            </Button>
          )}
        </div>
      </header>

      {snapshot?.truncated && (
        <p className="border-b bg-warning-background px-3 py-1.5 text-[11px] text-warning">
          {t('runGraph.truncated')}
        </p>
      )}

      {!snapshot || snapshot.nodes.length <= 1 ? (
        <div className="p-6">
          <EmptyState title={t('runGraph.empty')} />
        </div>
      ) : (
        <div className={cn('min-h-0 flex-1 overflow-auto p-2', compact && 'text-xs')}>
          <div ref={contentRef} className="relative min-h-full space-y-2">
            <RunGraphEdges
              containerRef={contentRef}
              nodes={snapshot.nodes}
              lanes={snapshot.lanes}
              edges={snapshot.edges}
              layoutKey={layoutKey}
              selectedId={selected}
            />
            {visibleLanes.map((lane) => {
              const nodes = snapshot.nodes.filter((node) => node.laneId === lane.id);
              const isCollapsed = collapsed.has(lane.id);
              return (
                <div key={lane.id} className="space-y-1.5" data-testid={`run-graph-lane-${lane.id}`}>
                  <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', LANE_DOT[lane.colorToken] ?? 'bg-muted-foreground')} />
                    <button
                      type="button"
                      onClick={() => setFocusLane(focusLane === lane.id ? null : lane.id)}
                      title={t('runGraph.focusHint')}
                      className="min-w-0 flex-1 truncate text-left text-xs font-medium"
                    >
                      {lane.name}
                    </button>
                    <span className="text-[10px] text-muted-foreground">{nodes.length}</span>
                    <button
                      type="button"
                      onClick={() => toggleCollapse(lane.id)}
                      aria-label={isCollapsed ? 'expand' : 'collapse'}
                      className="rounded px-1 text-xs text-muted-foreground hover:bg-accent"
                    >
                      {isCollapsed ? '+' : '−'}
                    </button>
                  </div>
                  {!isCollapsed && (
                    <div className="space-y-1.5 pl-6">
                      {nodes.map((node) => (
                        <RunGraphNodeCard
                          key={node.id}
                          node={node}
                          colorToken={lane.colorToken}
                          selected={selected === node.id}
                          onSelect={() => setSelected(selected === node.id ? null : node.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {selectedNode && <RunGraphNodeDetail node={selectedNode} />}
          </div>
        </div>
      )}

      <footer className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
        {live ? t('runGraph.liveHint') : t('runGraph.snapshotHint')}
      </footer>
    </section>
  );
}
