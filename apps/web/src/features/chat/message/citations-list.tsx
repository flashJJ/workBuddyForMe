'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { type Message } from '@wbfm/shared/types';
import { Badge } from '@/components/ui/badge';
import { DocumentViewerDialog } from '@/features/document-viewer';
import { formatCitationMeta } from '@/lib/citation-meta';
import { useI18n } from '@/lib/i18n/use-i18n';

/** 超过该条数默认折叠（≤3 保持平铺，短引用列表不增加操作成本） */
const COLLAPSE_THRESHOLD = 3;

/** 助手消息底部的引用来源列表（v1.3：静态层标签 + 页/段坐标；v1.5：超多可折叠） */
export function CitationsList({ message }: { message: Message }) {
  const { t } = useI18n();
  const collapsible = message.citations.length > COLLAPSE_THRESHOLD;
  // 超过阈值默认折叠，避免长来源列表把正文挤出视口
  const [expanded, setExpanded] = React.useState(!collapsible);
  const [viewer, setViewer] = React.useState<Message['citations'][number] | null>(null);
  if (message.citations.length === 0) return null;

  return (
    <div className="mt-2 space-y-1 border-t pt-2" data-testid="citations">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          data-testid="citations-toggle"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          )}
          <span>{t('chatMessages.citationsCollapsed', { count: message.citations.length })}</span>
          <span className="text-primary">
            （{expanded ? t('chatMessages.citationsCollapse') : t('chatMessages.citationsExpand')}）
          </span>
        </button>
      ) : (
        <p className="text-xs font-medium text-muted-foreground">{t('chatMessages.citations')}</p>
      )}
      {(!collapsible || expanded) && (
        <ol className="space-y-1" data-testid="citations-list">
          {message.citations.map((citation) => {
            const meta = formatCitationMeta(citation, t);
            return (
              <li key={`${citation.documentId}-${citation.ordinal}`} className="text-xs">
                <Badge variant="outline" className="mr-1">
                  [{citation.ordinal}]
                </Badge>
                {meta.kindLabel && (
                  <Badge variant="info" className="mr-1" data-testid="citation-static-kind">
                    {meta.kindLabel}
                  </Badge>
                )}
                {citation.sourceUrl ? (
                  <a
                    href={citation.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={citation.sourceUrl}
                    className="font-medium text-primary hover:underline"
                    data-testid="citation-source-link"
                  >
                    {citation.documentName}
                  </a>
                ) : (
                  <button
                    type="button"
                    className="font-medium hover:text-primary hover:underline"
                    title={t('documentViewer.title')}
                    data-testid="citation-open"
                    onClick={() => setViewer(citation)}
                  >
                    {citation.documentName}
                  </button>
                )}
                {meta.section && (
                  <span className="ml-1 text-muted-foreground" data-testid="citation-section">
                    · {meta.section}
                  </span>
                )}
                {meta.location && (
                  <span className="ml-1 text-muted-foreground" data-testid="citation-location">
                    · {meta.location}
                  </span>
                )}
                {citation.snippet && (
                  <span className="ml-1 text-muted-foreground">— {citation.snippet}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <DocumentViewerDialog
        documentId={viewer?.documentId ?? null}
        documentName={viewer?.documentName}
        open={Boolean(viewer)}
        onOpenChange={(open) => {
          if (!open) setViewer(null);
        }}
        focus={
          viewer
            ? {
                sectionPath: viewer.sectionPath,
                tableNo: viewer.tableNo,
                tableRow: viewer.tableRow,
                tableCell: viewer.tableCell,
              }
            : null
        }
      />
    </div>
  );
}
