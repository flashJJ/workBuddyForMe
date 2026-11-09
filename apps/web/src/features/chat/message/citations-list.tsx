'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { type Citation, type Message } from '@wbfm/shared/types';
import { Badge } from '@/components/ui/badge';
import { DocumentViewerDialog } from '@/features/document-viewer';
import { formatCitationMeta } from '@/lib/citation-meta';
import { useI18n } from '@/lib/i18n/use-i18n';
import { CITATION_FOCUS_EVENT, citationAnchorSelector } from './citation/citation-markers';

/** 超过该条数默认折叠（≤3 保持平铺，短引用列表不增加操作成本） */
const COLLAPSE_THRESHOLD = 3;
/** 角标定位后的高亮时长 */
const FLASH_MS = 1500;

interface NumberedCitation {
  citation: Citation;
  /** 展示编号：优先 citeIndex，旧消息按列表位置兜底 */
  number: number;
}

interface CitationGroup {
  kind: 'document' | 'web';
  items: NumberedCitation[];
}

/** v2.27：按「文档 / 网页」分组，组内保持原编号顺序 */
function groupCitations(citations: Citation[]): CitationGroup[] {
  const documents: NumberedCitation[] = [];
  const web: NumberedCitation[] = [];
  citations.forEach((citation, index) => {
    const item = { citation, number: citation.citeIndex ?? index + 1 };
    (citation.sourceUrl ? web : documents).push(item);
  });
  return [
    ...(documents.length > 0 ? [{ kind: 'document' as const, items: documents }] : []),
    ...(web.length > 0 ? [{ kind: 'web' as const, items: web }] : []),
  ];
}

/** 单条来源：编号 + 类型徽章 + 标题（可定位）+ 章节/坐标 + 片段 */
function CitationRow({
  item,
  onOpen,
}: {
  item: NumberedCitation;
  onOpen: (citation: Citation) => void;
}) {
  const { t } = useI18n();
  const { citation, number } = item;
  const meta = formatCitationMeta(citation, t);
  return (
    <li data-cite-index={number} className="scroll-mt-24 rounded text-xs">
      <Badge variant="outline" className="mr-1">
        [{number}]
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
          onClick={() => onOpen(citation)}
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
}

/** 助手消息底部的引用来源列表（v1.3：静态层标签 + 页/段坐标；v2.27：分组与角标定位） */
export function CitationsList({ message }: { message: Message }) {
  const { t } = useI18n();
  const collapsible = message.citations.length > COLLAPSE_THRESHOLD;
  // 超过阈值默认折叠，避免长来源列表把正文挤出视口。
  // 流式期间引用条数从 0 递增：不能把初始值写死进 state，否则首帧 ≤3 条时
  // expanded 恒为 true，之后涨到 6 条也不会折叠；只有用户手动点过开关才固定。
  const [override, setOverride] = React.useState<boolean | null>(null);
  const expanded = override ?? !collapsible;
  const [viewer, setViewer] = React.useState<Citation | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const seqRef = React.useRef(0);
  const [focusRequest, setFocusRequest] = React.useState<{ index: number; seq: number } | null>(
    null,
  );

  // v2.27：正文角标 → 来源卡；折叠状态下先展开，再滚动并高亮
  React.useEffect(() => {
    const root = containerRef.current?.closest('[data-message-id]');
    if (!root) return;
    const handler = (event: Event): void => {
      const index = (event as CustomEvent<{ index?: number }>).detail?.index;
      if (!index) return;
      setOverride(true);
      seqRef.current += 1;
      setFocusRequest({ index, seq: seqRef.current });
    };
    root.addEventListener(CITATION_FOCUS_EVENT, handler);
    return () => root.removeEventListener(CITATION_FOCUS_EVENT, handler);
  }, []);

  React.useEffect(() => {
    if (!focusRequest) return;
    const target =
      containerRef.current?.querySelector<HTMLElement>(citationAnchorSelector(focusRequest.index)) ??
      null;
    setFocusRequest(null);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('citation-flash');
    const timer = window.setTimeout(() => target.classList.remove('citation-flash'), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [focusRequest]);

  if (message.citations.length === 0) return null;

  const groups = groupCitations(message.citations);
  const docCount = groups.find((group) => group.kind === 'document')?.items.length ?? 0;
  const webCount = message.citations.length - docCount;

  return (
    <div ref={containerRef} className="mt-2 space-y-1 border-t pt-2" data-testid="citations">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOverride(!expanded)}
          aria-expanded={expanded}
          data-testid="citations-toggle"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          )}
          <span>
            {t('chatMessages.citationsCollapsed', {
              count: message.citations.length,
              doc: docCount,
              web: webCount,
            })}
          </span>
          <span className="text-primary">
            （{expanded ? t('chatMessages.citationsCollapse') : t('chatMessages.citationsExpand')}）
          </span>
        </button>
      ) : (
        <p className="text-xs font-medium text-muted-foreground">{t('chatMessages.citations')}</p>
      )}
      {(!collapsible || expanded) && (
        <div className="space-y-2">
          {groups.map((group) => (
            <div key={group.kind} data-testid={`citation-group-${group.kind}`}>
              {groups.length > 1 && (
                <p className="mb-0.5 text-[11px] font-medium text-muted-foreground">
                  {t(
                    group.kind === 'document'
                      ? 'chatMessages.citationGroupDocuments'
                      : 'chatMessages.citationGroupWeb',
                    { count: group.items.length },
                  )}
                </p>
              )}
              <ol className="space-y-1" data-testid="citations-list">
                {group.items.map((item) => (
                  <CitationRow key={`${item.citation.documentId}-${item.number}`} item={item} onOpen={setViewer} />
                ))}
              </ol>
            </div>
          ))}
        </div>
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
                citedAt: message.createdAt,
              }
            : null
        }
      />
    </div>
  );
}
