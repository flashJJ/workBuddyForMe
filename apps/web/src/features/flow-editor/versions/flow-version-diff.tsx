'use client';

import type { FlowGraphDiff } from '@wbfm/shared/schemas';
import { useI18n } from '@/lib/i18n/use-i18n';

/** v2.15：版本抽屉内的只读差异摘要 */
export function FlowVersionDiff({ diff }: { diff: FlowGraphDiff }) {
  const { t } = useI18n();
  const total =
    diff.summary.nodesAdded +
    diff.summary.nodesRemoved +
    diff.summary.nodesTypeChanged +
    diff.summary.nodesConfigChanged +
    diff.summary.edgesAdded +
    diff.summary.edgesRemoved;

  if (total === 0) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="flow-version-diff-empty">
        {t('flowEditor.versions.compareEmpty')}
      </p>
    );
  }

  const sections: Array<{ title: string; items: string[] }> = [
    {
      title: t('flowEditor.versions.diffNodesAdded'),
      items: diff.nodes.added.map((node) => `${node.id} (${node.type})`),
    },
    {
      title: t('flowEditor.versions.diffNodesRemoved'),
      items: diff.nodes.removed.map((node) => `${node.id} (${node.type})`),
    },
    {
      title: t('flowEditor.versions.diffNodesTypeChanged'),
      items: diff.nodes.typeChanged.map(
        (node) => `${node.id}: ${node.fromType} → ${node.toType}`,
      ),
    },
    {
      title: t('flowEditor.versions.diffNodesConfigChanged'),
      items: diff.nodes.configChanged.map(
        (node) => `${node.id}: ${node.keys.join(', ')}`,
      ),
    },
    {
      title: t('flowEditor.versions.diffEdgesAdded'),
      items: diff.edges.added.map(
        (edge) => `${edge.source} → ${edge.target}${edge.handle ? ` (${edge.handle})` : ''}`,
      ),
    },
    {
      title: t('flowEditor.versions.diffEdgesRemoved'),
      items: diff.edges.removed.map(
        (edge) => `${edge.source} → ${edge.target}${edge.handle ? ` (${edge.handle})` : ''}`,
      ),
    },
  ];

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-2" data-testid="flow-version-diff">
      <p className="text-xs font-medium">
        {t('flowEditor.versions.compareSummary', {
          added: String(diff.summary.nodesAdded),
          removed: String(diff.summary.nodesRemoved),
          typeChanged: String(diff.summary.nodesTypeChanged),
          configChanged: String(diff.summary.nodesConfigChanged),
          edgesAdded: String(diff.summary.edgesAdded),
          edgesRemoved: String(diff.summary.edgesRemoved),
        })}
      </p>
      {sections
        .filter((section) => section.items.length > 0)
        .map((section) => (
          <div key={section.title} className="space-y-0.5">
            <p className="text-xs text-muted-foreground">{section.title}</p>
            <ul className="space-y-0.5 text-xs">
              {section.items.map((item) => (
                <li key={item} className="font-mono">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}
