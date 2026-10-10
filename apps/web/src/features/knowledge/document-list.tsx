'use client';

import type { DocumentRecord } from '@wbfm/shared/types';
import type { DocumentStatus } from '@wbfm/shared/constants';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Badge } from '@/components/ui/badge';
import { EmptyState, Spinner } from '@/components/common/state';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useKnowledgeMutations } from '@/lib/hooks/use-knowledge';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useIntl } from '@/lib/i18n/use-intl';

const STATUS_VARIANT: Record<DocumentStatus, 'default' | 'success' | 'warning' | 'danger' | 'outline'> = {
  pending: 'outline',
  processing: 'warning',
  indexed: 'success',
  failed: 'danger',
  partial: 'warning',
};

const STATUS_KEYS: Record<DocumentStatus, MessageKey> = {
  pending: 'knowledge.documents.pending',
  processing: 'knowledge.documents.processing',
  indexed: 'knowledge.documents.indexed',
  failed: 'knowledge.documents.failed',
  partial: 'knowledge.documents.partial',
};

type CompileStatus = 'queued' | 'running' | 'ready' | 'failed';

const COMPILE_VARIANT: Record<CompileStatus, 'outline' | 'info' | 'success' | 'danger'> = {
  queued: 'outline',
  running: 'info',
  ready: 'success',
  failed: 'danger',
};

const COMPILE_KEYS: Record<CompileStatus, MessageKey> = {
  queued: 'knowledge.documents.compileQueued',
  running: 'knowledge.documents.compileRunning',
  ready: 'knowledge.documents.compileReady',
  failed: 'knowledge.documents.compileFailed',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function DocumentList({ kbId, documents, loading }: {
  kbId: string;
  documents: DocumentRecord[] | undefined;
  loading: boolean;
}) {
  const { t } = useI18n();
  const intl = useIntl();
  const mutations = useKnowledgeMutations();
  const confirm = useConfirm();

  /** v0.4：OCR 进行中覆盖处理中文案；partial 给出部分识别提示 */
  const badgeLabel = (document: DocumentRecord): string => {
    if (document.status === 'processing' && document.ocrStatus === 'running') {
      return t('knowledge.documents.ocrRunning');
    }
    return t(STATUS_KEYS[document.status]);
  };

  const badgeTitle = (document: DocumentRecord): string | undefined => {
    if (document.status === 'failed') {
      return document.errorMessage ?? t('knowledge.documents.indexFailed');
    }
    if (document.status === 'partial') {
      return t('knowledge.documents.partialTitle');
    }
    return undefined;
  };

  const remove = async (document: DocumentRecord) => {
    if (
      !(await confirm({
        title: t('knowledge.documents.deleteTitle'),
        description: t('knowledge.documents.deleteConfirm', { name: document.filename }),
        confirmText: t('common.actions.delete'),
        danger: true,
      }))
    ) {
      return;
    }
    void mutations.deleteDocument.mutateAsync({ kbId, documentId: document.id });
  };

  if (loading) return <Spinner />;
  if (!documents || documents.length === 0) {
    return (
      <EmptyState
        title={t('knowledge.documents.emptyTitle')}
        description={t('knowledge.documents.emptyDescription')}
      />
    );
  }

  return (
    <ul className="divide-y rounded-lg border" data-testid="document-list">
      {documents.map((document) => (
        <li key={document.id} className="flex items-center gap-3 px-4 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate font-medium" title={document.filename}>
              {document.source === 'webpage' && (
                <Badge variant="outline" className="shrink-0 text-[10px]" data-testid="webpage-badge">
                  {t('knowledge.documents.webpageBadge')}
                </Badge>
              )}
              <span className="truncate">{document.filename}</span>
            </p>
            <p className="truncate text-xs text-muted-foreground" title={document.sourceUrl ?? undefined}>
              {formatSize(document.byteSize)} ·{' '}
              {document.chunkCount > 0
                ? t('knowledge.documents.chunks', { count: document.chunkCount })
                : t('knowledge.documents.notChunked')}
              {document.sourceUrl ? ` · ${document.sourceUrl}` : ''}
            </p>
            {(document.indexedAt || document.compiledAt) && (
              <p
                className="truncate text-[11px] text-muted-foreground/80"
                data-testid="document-timestamps"
              >
                {document.indexedAt &&
                  t('knowledge.documents.indexedAt', { time: intl.formatDate(document.indexedAt) })}
                {document.indexedAt && document.compiledAt && ' · '}
                {document.compiledAt &&
                  t('knowledge.documents.compiledAt', { time: intl.formatDate(document.compiledAt) })}
              </p>
            )}
          </div>
          {document.sourceUrl && (
            <a
              href={document.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs text-primary hover:underline"
              data-testid="webpage-source-link"
            >
              {t('knowledge.documents.sourceLink')}
            </a>
          )}
          <Badge variant={STATUS_VARIANT[document.status]} title={badgeTitle(document)}>
            {badgeLabel(document)}
          </Badge>
          {document.compileStatus && document.compileStatus !== 'skipped' && (
            <Badge
              variant={COMPILE_VARIANT[document.compileStatus as CompileStatus]}
              title={document.compileError ?? undefined}
              data-testid="compile-status-badge"
            >
              {t(COMPILE_KEYS[document.compileStatus as CompileStatus])}
            </Badge>
          )}
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-destructive"
            aria-label={t('knowledge.documents.deleteAria', { name: document.filename })}
            onClick={() => remove(document)}
          >
            {t('common.actions.delete')}
          </button>
        </li>
      ))}
    </ul>
  );
}
