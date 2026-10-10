'use client';

import * as React from 'react';
import type { ClaimDimension, ConflictItem, DuplicatePair } from '@wbfm/core/knowledge';
import { Badge } from '@/components/ui/badge';
import { useKnowledgeGovernance } from '@/lib/hooks/use-knowledge';
import { formatCitationMeta } from '@/lib/citation-meta';
import { useI18n } from '@/lib/i18n/use-i18n';

function dimensionLabel(t: ReturnType<typeof useI18n>['t'], dimension: ClaimDimension): string {
  if (dimension === 'version') return t('knowledge.governance.dimVersion');
  if (dimension === 'scalar') return t('knowledge.governance.dimScalar');
  return t('knowledge.governance.dimTitle');
}

function ConflictCard({ item }: { item: ConflictItem }) {
  const { t } = useI18n();
  return (
    <li className="rounded-md border p-3 text-xs" data-testid="conflict-item">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="info">{dimensionLabel(t, item.dimension)}</Badge>
        <span className="font-medium">{item.entityName}</span>
      </div>
      <ul className="space-y-2">
        {item.values.map((value) => (
          <li key={value.value} className="border-l-2 pl-2">
            <p>
              <span className="text-muted-foreground">
                {t('knowledge.governance.valueLabel')}：
              </span>
              <span className="font-medium">{value.raw}</span>
            </p>
            {value.occurrences.map((occurrence) => {
              const location = formatCitationMeta(
                { pageNo: occurrence.pageNo ?? null, paragraphNo: occurrence.paragraphNo ?? null, staticKind: 'entity' },
                t,
              ).location;
              return (
                <p key={`${occurrence.documentId}:${occurrence.context}`} className="mt-1 text-muted-foreground">
                  <span className="font-medium text-foreground/80">{occurrence.documentName}</span>
                  {location && <span> · {location}</span>}
                  <span className="mt-0.5 block">{occurrence.context}</span>
                </p>
              );
            })}
          </li>
        ))}
      </ul>
    </li>
  );
}

function DuplicateCard({ pair }: { pair: DuplicatePair }) {
  const { t } = useI18n();
  return (
    <li className="rounded-md border p-3 text-xs" data-testid="duplicate-item">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        {pair.reasons.map((reason) => (
          <Badge key={reason} variant="info">
            {reason === 'title'
              ? t('knowledge.governance.reasonTitle')
              : t('knowledge.governance.reasonContent')}
          </Badge>
        ))}
      </div>
      <p className="font-medium">
        {pair.documentA.filename}
        <span className="mx-1 text-muted-foreground">↔</span>
        {pair.documentB.filename}
      </p>
      {pair.matchedChunks > 0 && (
        <p className="mt-1 text-muted-foreground">
          {t('knowledge.governance.matchedChunks', { count: String(pair.matchedChunks) })} ·{' '}
          {t('knowledge.governance.similarity', { value: pair.maxSimilarity.toFixed(2) })}
        </p>
      )}
    </li>
  );
}

/** 知识治理面板：待裁决冲突 + 疑似重复文档（只读建议，不含任何删除动作） */
export function GovernancePanel({ kbId }: { kbId: string }) {
  const { t } = useI18n();
  const { conflicts, duplicates } = useKnowledgeGovernance(kbId);
  const conflictItems = conflicts.data?.conflicts ?? [];
  const duplicateItems = duplicates.data?.duplicates ?? [];
  const loading = conflicts.isLoading || duplicates.isLoading;

  if (loading || (conflictItems.length === 0 && duplicateItems.length === 0)) return null;

  return (
    <section className="space-y-4" data-testid="knowledge-governance">
      <h2 className="text-sm font-semibold">{t('knowledge.governance.title')}</h2>

      {conflictItems.length > 0 && (
        <div className="space-y-2" data-testid="conflicts-section">
          <div>
            <h3 className="text-xs font-medium">
              {t('knowledge.governance.conflictsTitle')}
              <Badge variant="outline" className="ml-2">{conflictItems.length}</Badge>
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('knowledge.governance.conflictsHint')}
            </p>
          </div>
          <ul className="space-y-2">
            {conflictItems.map((item) => (
              <ConflictCard key={`${item.normalizedName}:${item.dimension}`} item={item} />
            ))}
          </ul>
        </div>
      )}

      {duplicateItems.length > 0 && (
        <div className="space-y-2" data-testid="duplicates-section">
          <div>
            <h3 className="text-xs font-medium">
              {t('knowledge.governance.duplicatesTitle')}
              <Badge variant="outline" className="ml-2">{duplicateItems.length}</Badge>
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('knowledge.governance.duplicatesHint')}
            </p>
          </div>
          <ul className="space-y-2">
            {duplicateItems.map((pair) => (
              <DuplicateCard
                key={`${pair.documentA.documentId}:${pair.documentB.documentId}`}
                pair={pair}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
