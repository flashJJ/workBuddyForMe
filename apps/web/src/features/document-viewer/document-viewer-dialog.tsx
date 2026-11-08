'use client';

import * as React from 'react';
import type { DocumentStructureView } from '@wbfm/core/services';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/common/state';
import { formatCitationMeta } from '@/lib/citation-meta';
import { useDocumentStructure } from '@/lib/hooks/knowledge';
import { useI18n } from '@/lib/i18n/use-i18n';
import { ChapterTree } from './chapter-tree';
import { FigurePanel } from './figure-panel';
import { TablePanel } from './table-panel';
import { sameSectionPath, type DocumentViewerFocus } from './types';

type Block = DocumentStructureView['blocks'][number];

const KIND_KEYS = {
  heading: 'documentViewer.kindHeading',
  paragraph: 'documentViewer.kindParagraph',
  list: 'documentViewer.kindList',
  table: 'documentViewer.kindTable',
  figure: 'documentViewer.kindFigure',
} as const;

interface Props {
  documentId: string | null;
  documentName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focus?: DocumentViewerFocus | null;
  /** 额外页脚操作（知识库页重建按钮） */
  actions?: React.ReactNode;
}

/** v2.19 M4：章节树 / 原文块 / 表格 / 图注与引用定位的统一查看器 */
export function DocumentViewerDialog({
  documentId,
  documentName,
  open,
  onOpenChange,
  focus = null,
  actions,
}: Props) {
  const { t } = useI18n();
  const structure = useDocumentStructure(documentId, open && Boolean(documentId));
  const data = structure.data;
  const focusKey = focus ? JSON.stringify(focus) : '';
  const [selectedPath, setSelectedPath] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open || !data) return;
    if (focus?.sectionPath && focus.sectionPath.length > 0) {
      setSelectedPath(focus.sectionPath);
      return;
    }
    if (focus?.tableNo !== undefined) {
      const block = data.blocks.find((item) => item.table?.tableNo === focus.tableNo);
      setSelectedPath(block?.sectionPath ?? data.sections[0]?.path ?? []);
      return;
    }
    setSelectedPath(data.sections[0]?.path ?? []);
    // focus 由调用方按引用生成；以序列化键避免对象引用抖动
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data, focusKey]);

  React.useEffect(() => {
    if (open) void structure.refetch();
    // 仅在打开或文档切换时刷新（引用定位复用同一份结构）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, documentId]);

  const citationStale = React.useMemo(() => {
    if (!focus?.citedAt || !data?.parsedAt) return false;
    const cited = Date.parse(focus.citedAt);
    const parsed = Date.parse(data.parsedAt);
    return Number.isFinite(cited) && Number.isFinite(parsed) && parsed > cited;
  }, [focus?.citedAt, data?.parsedAt]);

  const figures = React.useMemo(
    () =>
      (data?.blocks ?? [])
        .filter((block) => block.kind === 'figure')
        .map((block) => ({ blockId: block.id, caption: block.content, pageNo: block.pageNo })),
    [data],
  );

  const blocks: Block[] = React.useMemo(() => {
    const all = data?.blocks ?? [];
    if (selectedPath.length === 0) return all;
    return all.filter((block) => sameSectionPath(block.sectionPath, selectedPath));
  }, [data, selectedPath]);

  const citationMeta = focus ? formatCitationMeta(focus, t) : null;
  const citationText = [citationMeta?.section, citationMeta?.location].filter(Boolean).join(' · ');

  const kindLabel = (block: Block): string => t(KIND_KEYS[block.kind]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl" data-testid="document-structure-dialog">
        <DialogHeader>
          <DialogTitle>{t('documentViewer.title')}</DialogTitle>
          <DialogDescription>
            {documentName}
            {data?.parsedAt ? ` · ${data.parsedAt}` : ''}
            {' · '}
            {t('documentViewer.description')}
          </DialogDescription>
        </DialogHeader>

        {citationText && (
          <p
            className="rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs text-sky-800"
            data-testid="citation-focus"
          >
            {t('documentViewer.citationLocated')}：{citationText}
          </p>
        )}

        {citationStale && (
          <p
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800"
            data-testid="citation-stale"
          >
            {t('documentViewer.citationStale')}
          </p>
        )}

        {structure.isLoading ? (
          <Spinner />
        ) : data ? (
          <div className="max-h-[62vh] space-y-4 overflow-y-auto pr-1 text-sm">
            {data.warnings.length > 0 && (
              <div
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
                data-testid="structure-warnings"
              >
                <p className="mb-1 font-medium">{t('documentViewer.warnings')}</p>
                <ul className="list-inside list-disc space-y-0.5">
                  {data.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {data.quality?.unrebuildable ? (
              <p
                className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
                data-testid="quality-unrebuildable"
              >
                {t('documentViewer.qualityUnrebuildable')}
              </p>
            ) : data.quality?.pendingReparse ? (
              <p
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
                data-testid="quality-pending-reparse"
              >
                {t('documentViewer.qualityPending')}
              </p>
            ) : null}

            {!data.structureAvailable ? (
              <p className="rounded-md border bg-muted/40 px-3 py-4 text-muted-foreground">
                {t('documentViewer.unavailable')}
              </p>
            ) : (
              <>
                <section>
                  <h3 className="mb-2 font-medium">{t('documentViewer.sections')}</h3>
                  <ChapterTree
                    sections={data.sections}
                    selectedPath={selectedPath}
                    onSelect={setSelectedPath}
                  />
                </section>

                <section data-testid="structure-blocks">
                  <h3 className="mb-2 font-medium">{t('documentViewer.blocksTitle')}</h3>
                  {blocks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('documentViewer.noBlocks')}</p>
                  ) : (
                    <div className="space-y-2">
                      {blocks.map((block) => (
                        <article
                          key={block.id}
                          className="rounded-md border bg-muted/20 px-3 py-2"
                          data-testid="structure-block"
                          data-kind={block.kind}
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <Badge variant="outline" className="text-[11px]">
                              {kindLabel(block)}
                            </Badge>
                            {block.pageNo !== null && (
                              <span className="text-[11px] text-muted-foreground">
                                {t('documentViewer.figurePage', { page: String(block.pageNo) })}
                              </span>
                            )}
                          </div>
                          <p
                            className={`whitespace-pre-wrap break-words text-xs ${
                              block.kind === 'heading' ? 'font-medium' : ''
                            }`}
                          >
                            {block.content}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <TablePanel tables={data.tables} focus={focus} />

                <FigurePanel
                  documentId={data.documentId}
                  figures={figures}
                  visionAvailable={Boolean(data.visionAvailable)}
                />

                {data.pages.length > 0 && (
                  <section>
                    <h3 className="mb-2 font-medium">{t('documentViewer.pages')}</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {data.pages.map((page) => (
                        <Badge key={page.pageNo} variant="outline" className="text-[11px]">
                          {t('documentViewer.pageItem', {
                            page: String(page.pageNo),
                            count: page.blockIds.length,
                          })}
                        </Badge>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {structure.isError
              ? t('documentViewer.unavailable')
              : t('documentViewer.loading')}
          </p>
        )}

        <DialogFooter>
          {actions}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('documentViewer.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
