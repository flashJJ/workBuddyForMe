'use client';

import * as React from 'react';
import type { RunGraphNode, RunGraphNodeStatus } from '@wbfm/shared/types';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { RunningBorder } from '@/components/ui/light-layer';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/use-i18n';

function statusVariant(status: RunGraphNodeStatus): BadgeProps['variant'] {
  if (status === 'failed' || status === 'interrupted' || status === 'budget_exceeded') return 'danger';
  if (status === 'succeeded') return 'success';
  if (status === 'running' || status === 'queued') return 'info';
  if (status === 'waiting') return 'warning';
  return 'outline';
}

export function RunGraphNodeCard({
  node,
  colorToken,
  selected,
  onSelect,
}: {
  node: RunGraphNode;
  colorToken: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="relative rounded-md" data-graph-node-wrapper>
      <button
        type="button"
        onClick={onSelect}
        data-testid="run-graph-node"
        data-graph-node-id={node.id}
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
      <RunningBorder active={node.status === 'running'} colorToken={colorToken} label={node.label} />
    </div>
  );
}

export function RunGraphNodeDetail({ node }: { node: RunGraphNode }) {
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
