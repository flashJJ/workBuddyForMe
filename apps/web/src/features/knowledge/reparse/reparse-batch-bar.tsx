'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DocumentRecord } from '@wbfm/shared/types';
import { DOCUMENT_PARSE_VERSION } from '@wbfm/shared/constants';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { QUERY_KEYS } from '@/lib/api/endpoints';
import { useKnowledgeMutations, useReparseBatchStatus } from '@/lib/hooks/knowledge';
import { useI18n } from '@/lib/i18n/use-i18n';

/** v2.29 P1：批量重建工具条（开始/暂停/继续/停止 + 进度） */
export function ReparseBatchBar({
  kbId,
  documents,
}: {
  kbId: string;
  documents?: DocumentRecord[];
}) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const statusQuery = useReparseBatchStatus(kbId);
  const mutations = useKnowledgeMutations();
  const status = statusQuery.data;

  const pendingCount = (documents ?? []).filter(
    (document) =>
      document.parseVersion < DOCUMENT_PARSE_VERSION &&
      document.status !== 'pending' &&
      document.status !== 'processing',
  ).length;

  const activeHere = status?.knowledgeBaseId === kbId && status.state !== 'idle';
  const busyElsewhere = Boolean(
    status?.knowledgeBaseId &&
      status.knowledgeBaseId !== kbId &&
      (status.state === 'running' || status.state === 'paused'),
  );
  const visible = pendingCount > 0 || activeHere || busyElsewhere;

  React.useEffect(() => {
    if (status?.knowledgeBaseId === kbId && status.state === 'completed') {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.documents(kbId) });
    }
  }, [status?.knowledgeBaseId, status?.state, kbId, qc]);

  if (!visible) return null;

  const run = async (action: 'start' | 'pause' | 'resume' | 'cancel') => {
    try {
      await mutations.reparseBatch.mutateAsync({ kbId, action });
    } catch {
      toast.error(t('knowledgeReparse.startFailed'));
    }
  };

  const progress = status
    ? t('knowledgeReparse.progress', {
        done: status.done,
        total: status.total,
        failed: status.failed,
        skipped: status.skipped,
      })
    : null;

  return (
    <div
      className="mb-3 rounded-lg border bg-muted/30 px-3 py-2 text-xs"
      data-testid="reparse-batch-bar"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <p className="flex items-center gap-2 font-medium">
            {t('knowledgeReparse.title')}
            {pendingCount > 0 && (
              <Badge variant="warning">
                {t('knowledgeReparse.pending', { count: pendingCount })}
              </Badge>
            )}
          </p>
          {busyElsewhere ? (
            <p className="text-muted-foreground">{t('knowledgeReparse.busyElsewhere')}</p>
          ) : (
            <>
              {status?.state === 'running' && (
                <p className="text-muted-foreground" data-testid="reparse-batch-progress">
                  {progress}
                  {status.currentFilename && ` · ${t('knowledgeReparse.running', {
                    name: status.currentFilename,
                  })}`}
                  {status.pauseRequested && ` · ${t('knowledgeReparse.pausing')}`}
                  {status.cancelRequested && ` · ${t('knowledgeReparse.cancelling')}`}
                </p>
              )}
              {status?.state === 'paused' && (
                <p className="text-muted-foreground" data-testid="reparse-batch-progress">
                  {progress}
                </p>
              )}
              {status?.state === 'completed' && (
                <p className="text-muted-foreground" data-testid="reparse-batch-result">
                  {t('knowledgeReparse.completed', {
                    done: status.done,
                    failed: status.failed,
                    skipped: status.skipped,
                  })}
                </p>
              )}
              {status?.state === 'cancelled' && (
                <p className="text-muted-foreground" data-testid="reparse-batch-result">
                  {t('knowledgeReparse.cancelled', {
                    done: status.done,
                    failed: status.failed,
                    skipped: status.skipped,
                  })}
                </p>
              )}
            </>
          )}
        </div>

        {!busyElsewhere && (
          <div className="flex items-center gap-2">
            {(!status || status.state === 'idle' || status.state === 'completed' || status.state === 'cancelled') && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pendingCount === 0 || mutations.reparseBatch.isPending}
                onClick={() => void run('start')}
                data-testid="reparse-batch-start"
              >
                {status?.state === 'completed' || status?.state === 'cancelled'
                  ? t('knowledgeReparse.restart')
                  : t('knowledgeReparse.start')}
              </Button>
            )}
            {(status?.state === 'running' || status?.state === 'paused') && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void run(
                      status.state === 'paused' || status.pauseRequested ? 'resume' : 'pause',
                    )
                  }
                  data-testid="reparse-batch-toggle"
                >
                  {status.state === 'paused' || status.pauseRequested
                    ? t('knowledgeReparse.resume')
                    : t('knowledgeReparse.pause')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={status.cancelRequested}
                  onClick={() => void run('cancel')}
                  data-testid="reparse-batch-cancel"
                >
                  {t('knowledgeReparse.cancel')}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {status && status.failures.length > 0 && (
        <details className="mt-1 text-muted-foreground">
          <summary className="cursor-pointer">{t('knowledgeReparse.failedTitle')}</summary>
          <ul className="mt-1 space-y-0.5">
            {status.failures.slice(0, 5).map((failure) => (
              <li key={failure.documentId} title={failure.message}>
                {failure.filename}：{failure.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
