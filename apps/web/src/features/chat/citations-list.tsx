'use client';

import { type Message } from '@wbfm/shared/types';
import { Badge } from '@/components/ui/badge';
import { formatCitationMeta } from '@/lib/citation-meta';
import { useI18n } from '@/lib/i18n/use-i18n';

/** 助手消息底部的引用来源列表（v1.3：静态层标签 + 页/段坐标） */
export function CitationsList({ message }: { message: Message }) {
  const { t } = useI18n();
  if (message.citations.length === 0) return null;
  return (
    <div className="mt-2 space-y-1 border-t pt-2" data-testid="citations">
      <p className="text-xs font-medium text-muted-foreground">{t('chatMessages.citations')}</p>
      <ol className="space-y-1">
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
                <span className="font-medium">{citation.documentName}</span>
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
    </div>
  );
}
