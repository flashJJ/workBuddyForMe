'use client';

import * as React from 'react';
import type { DocumentRecord } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { ApiClientError } from '@/lib/api/client';
import {
  useCompileEvents,
  useCompileStatus,
  useKnowledgeMutations,
} from '@/lib/hooks/use-knowledge';
import { useI18n } from '@/lib/i18n/use-i18n';

/**
 * v1.3 M4：编译工具栏——进度徽标（SSE 实时 + 轮询兜底）、
 * 编译新增（含失败重试）、全部重建（显式确认 + 文档数预估）、取消。
 */
export function CompileToolbar({
  kbId,
  documents,
}: {
  kbId: string;
  documents: DocumentRecord[] | undefined;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const mutations = useKnowledgeMutations();
  const { data: status } = useCompileStatus(kbId);
  useCompileEvents(kbId);

  const counts = status?.counts;
  const progress = status?.progress ?? null;
  const busy = (counts?.running ?? 0) > 0 || (counts?.queued ?? 0) > 0;

  const currentName = React.useMemo(() => {
    if (!progress?.currentDocumentId) return null;
    return (
      documents?.find((doc) => doc.id === progress.currentDocumentId)?.filename ?? null
    );
  }, [documents, progress?.currentDocumentId]);

  const reportError = (error: unknown) => {
    toast.error(
      error instanceof ApiClientError ? error.message : t('knowledge.compile.actionFailed'),
    );
  };

  const compileNew = async () => {
    try {
      const result = await mutations.compile.mutateAsync({ kbId, scope: 'new' });
      toast.success(
        result.queued > 0
          ? t('knowledge.compile.queuedToast', { count: result.queued })
          : t('knowledge.compile.compileNone'),
      );
    } catch (error) {
      reportError(error);
    }
  };

  const rebuildAll = async () => {
    const count = documents?.length ?? 0;
    if (
      !(await confirm({
        title: t('knowledge.compile.rebuildTitle'),
        description: t('knowledge.compile.rebuildConfirm', { count }),
        confirmText: t('knowledge.compile.rebuildAll'),
      }))
    ) {
      return;
    }
    try {
      const result = await mutations.compile.mutateAsync({ kbId, scope: 'all' });
      toast.success(t('knowledge.compile.queuedToast', { count: result.queued }));
    } catch (error) {
      reportError(error);
    }
  };

  const cancel = async () => {
    try {
      await mutations.compileCancel.mutateAsync(kbId);
      toast.success(t('knowledge.compile.cancelledToast'));
    } catch (error) {
      reportError(error);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="compile-toolbar">
      {progress && progress.total > 0 && (
        <span className="text-xs text-muted-foreground" data-testid="compile-progress">
          {t('knowledge.compile.progress', { done: progress.done, total: progress.total })}
          {currentName ? ` · ${t('knowledge.compile.compilingDoc', { name: currentName })}` : ''}
        </span>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        data-testid="compile-new"
        onClick={() => void compileNew()}
      >
        {t('knowledge.compile.compileNew')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        data-testid="compile-rebuild"
        onClick={() => void rebuildAll()}
      >
        {t('knowledge.compile.rebuildAll')}
      </Button>
      {busy && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="compile-cancel"
          onClick={() => void cancel()}
        >
          {t('knowledge.compile.cancel')}
        </Button>
      )}
    </div>
  );
}
