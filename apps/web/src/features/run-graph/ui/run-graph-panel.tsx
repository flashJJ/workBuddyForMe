'use client';

import * as React from 'react';
import type {
  RunGraphNode,
  RunGraphNodeStatus,
  RunGraphRootKind,
} from '@wbfm/shared/types';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useRunGraph } from '../hooks/use-run-graph';

const LANE_DOT: Record<string, string> = {
  primary: 'bg-primary',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  accent: 'bg-accent',
  destructive: 'bg-destructive',
};

function statusVariant(status: RunGraphNodeStatus): BadgeProps['variant'] {
  if (status === 'failed' || status === 'interrupted' || status === 'budget_exceeded') return 'danger';
  if (status === 'succeeded') return 'success';
  if (status === 'running' || status === 'queued') return 'info';
  if (status === 'waiting') return 'warning';
  return 'outline';
}

function NodeCard({
  node,
  selected,
  onSelect,
}: {
  node: RunGraphNode;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid="run-graph-node"
      data-kind={node.kind}
      data-status={node.status}
      className={cn(
        'w-full rounded-md border bg-card px-2.5 py-2 text-left transition-colors hover:bg-accent/40',
        selected && 'ring-2 ring-ring',
        node.status === 'failed' && 'border-destructive/40',
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {t(`runGraph.kind.${node.kind}` as MessageKey)}
        </span>
        <Badge variant={statusVariant(node.status)} className="ml-auto">
          {t(`runGraph.outcome.${node.status}` as MessageKey)}
        </Badge>
      </span>
      <span className="mt-1 block truncate text-xs font-medium">{node.label}</span>
      {node.summary && (
        <span className="mt-0.5 line-clamp-2 block text-[11px] text-muted-foreground">
          {node.summary}
        </span>
      )}
    </button>
  );
}

function NodeDetail({ node }: { node: RunGraphNode }) {
  const { t } = useI18n();
  return (
    <div className="rounded-md border bg-muted/30 p-2.5 text-xs" data-testid="run-graph-detail">
      <div className="flex items-center gap-2">
        <span className="font-medium">{node.label}</span>
        <Badge variant={statusVariant(node.status)}>{t(`runGraph.outcome.${node.status}` as MessageKey)}</Badge>
      </div>
      {node.summary && <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{node.summary}</p>}
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <dt>kind</dt>
        <dd className="break-all text-foreground">{node.kind}</dd>
        <dt>scope</dt>
        <dd className="break-all text-foreground">{node.scopeId}</dd>
        {node.errorCode && (
          <>
            <dt>error</dt>
            <dd className="break-all text-destructive">{node.errorCode}</dd>
          </>
        )}
      </dl>
      {node.artifact && (
        <a
          href={`/api/artifacts/${encodeURIComponent(node.artifact.attachmentId)}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex text-primary underline underline-offset-2"
        >
          {t('runGraph.openArtifact')} · {node.artifact.filename}
        </a>
      )}
    </div>
  );
}

export interface RunGraphPanelProps {
  kind: RunGraphRootKind;
  id: string | null;
  className?: string;
  compact?: boolean;
  onClose?: () => void;
}

/** v2.20 M2：只读过程图（车道 + 节点 + 详情）；同一组件供会话/会议复用。 */
export function RunGraphPanel({ kind, id, className, compact = false, onClose }: RunGraphPanelProps) {
  const { t } = useI18n();
  const query = useRunGraph(kind, id, true);
  const [focusLane, setFocusLane] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = React.useState<string | null>(null);

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

  return (
    <section
      className={cn('flex min-h-0 flex-col rounded-lg border bg-card', className)}
      data-testid="run-graph-panel"
      data-root-kind={kind}
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
        <div className={cn('min-h-0 flex-1 space-y-2 overflow-auto p-2', compact && 'text-xs')}>
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
                  <div className="space-y-1.5 pl-2">
                    {nodes.map((node) => (
                      <NodeCard
                        key={node.id}
                        node={node}
                        selected={selected === node.id}
                        onSelect={() => setSelected(selected === node.id ? null : node.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {selectedNode && <NodeDetail node={selectedNode} />}
        </div>
      )}

      <footer className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
        {t('runGraph.pollHint')}
      </footer>
    </section>
  );
}
