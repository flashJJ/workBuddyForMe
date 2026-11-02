'use client';

import * as React from 'react';
import type { DocumentRecord } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { useDocumentStructure, useKnowledgeMutations } from '@/lib/hooks/knowledge';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  kbId: string;
  document: DocumentRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** v2.19 文档结构面板：章节/表格/页与解析警告，支持手动重建 */
export function DocumentStructureDialog({ kbId, document, open, onOpenChange }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const mutations = useKnowledgeMutations();
  const structure = useDocumentStructure(document?.id ?? null, open && Boolean(document));
  const [rebuilding, setRebuilding] = React.useState(false);

  React.useEffect(() => {
    if (open) void structure.refetch();
    // 仅在文档状态变化时刷新（重建完成/失败后同步最新结构）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document?.status, open]);

  const reparse = async () => {
    if (!document) return;
    setRebuilding(true);
    try {
      await mutations.reparseDocument.mutateAsync({ kbId, documentId: document.id });
      toast.success(t('knowledge.structure.reparseStarted'));
      void structure.refetch();
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : t('knowledge.structure.reparseFailed'),
      );
    } finally {
      setRebuilding(false);
    }
  };

  const data = structure.data;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" data-testid="document-structure-dialog">
        <DialogHeader>
          <DialogTitle>{t('knowledge.structure.title')}</DialogTitle>
          <DialogDescription>
            {document?.filename}
            {data?.parsedAt ? ` · ${data.parsedAt}` : ''}
            {' · '}
            {t('knowledge.structure.description')}
          </DialogDescription>
        </DialogHeader>

        {structure.isLoading ? (
          <Spinner />
        ) : data ? (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1 text-sm">
            {data.warnings.length > 0 && (
              <div
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
                data-testid="structure-warnings"
              >
                <p className="mb-1 font-medium">{t('knowledge.structure.warnings')}</p>
                <ul className="list-inside list-disc space-y-0.5">
                  {data.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {!data.structureAvailable ? (
              <p className="rounded-md border bg-muted/40 px-3 py-4 text-muted-foreground">
                {t('knowledge.structure.unavailable')}
              </p>
            ) : (
              <>
                <section data-testid="structure-sections">
                  <h3 className="mb-2 font-medium">
                    {t('knowledge.structure.sections')} · {data.sections.length}
                  </h3>
                  {data.sections.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t('knowledge.structure.noSections')}
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {data.sections.map((section) => (
                        <li
                          key={section.path.join(' › ')}
                          className="flex items-center justify-between rounded bg-muted/40 px-2 py-1"
                          style={{ paddingLeft: 8 + (section.path.length - 1) * 14 }}
                        >
                          <span className="truncate">{section.path.join(' › ')}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {t('knowledge.structure.sectionBlocks', {
                              count: section.blockIds.length,
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section data-testid="structure-tables">
                  <h3 className="mb-2 font-medium">
                    {t('knowledge.structure.tables')} · {data.tables.length}
                  </h3>
                  {data.tables.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t('knowledge.structure.noTables')}
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {data.tables.map((table) => (
                        <li key={table.tableNo} className="rounded border px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {t('knowledge.structure.tableCaption', { no: String(table.tableNo) })}
                            </Badge>
                            {table.caption && (
                              <span className="truncate text-xs">{table.caption}</span>
                            )}
                            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                              {t('knowledge.structure.tableRows', {
                                count: table.rows.length,
                              })}
                            </span>
                          </div>
                          {table.header.length > 0 && (
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {table.header.join(' | ')}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {data.pages.length > 0 && (
                  <section>
                    <h3 className="mb-2 font-medium">{t('knowledge.structure.pages')}</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {data.pages.map((page) => (
                        <Badge key={page.pageNo} variant="outline" className="text-[11px]">
                          {t('knowledge.structure.pageItem', {
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
              ? t('knowledge.structure.unavailable')
              : t('knowledge.structure.loading')}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.actions.close')}
          </Button>
          <Button
            type="button"
            data-testid="reparse-document"
            disabled={!document || rebuilding || document.status === 'processing'}
            onClick={() => void reparse()}
          >
            {rebuilding ? t('knowledge.structure.reparsing') : t('knowledge.structure.reparse')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
