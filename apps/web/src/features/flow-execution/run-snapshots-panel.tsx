'use client';

import * as React from 'react';
import type { RollbackResult } from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { errorText } from '@/lib/i18n/resolve-error';
import { useRollbackRun, useRunSnapshots } from '@/lib/hooks/flows';

/** v5.1：运行详情的文件快照清单与按运行回滚 */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const ACTION_KEYS: Record<string, string> = {
  write_overwrite: '覆盖写',
  write_new: '新建写',
  delete: '删除',
  move: '移动',
};

export function RunSnapshotsPanel({ runId }: { runId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const snapshots = useRunSnapshots(runId);
  const rollback = useRollbackRun();
  const [preview, setPreview] = React.useState<RollbackResult | null>(null);

  const rows = snapshots.data?.snapshots ?? [];
  const usage = snapshots.data?.usage;
  const conflicts = preview?.entries.filter((item) => item.status === 'conflict') ?? [];
  const actionable = (preview?.totals.restored ?? 0) + (preview?.totals.deleted ?? 0);

  const run = async (params: { dryRun: boolean; force?: string[] }) => {
    try {
      const result = await rollback.mutateAsync({ runId, ...params });
      if (result.dryRun) {
        setPreview(result);
        return;
      }
      toast.success(
        t('flowRuns.fileSafety.done', {
          restored: result.totals.restored,
          deleted: result.totals.deleted,
        }),
      );
      setPreview(null);
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'flowRuns.fileSafety.rollbackFailed' }));
    }
  };

  return (
    <details className="border-b bg-ui-card">
      <summary className="cursor-pointer px-6 py-2 text-[11px] text-muted-foreground">
        {t('flowRuns.fileSafety.title')}（{rows.length}）
      </summary>
      <div className="space-y-2 px-6 pb-3 text-[11px]">
        {usage && (
          <p className="text-muted-foreground">
            {t('flowRuns.fileSafety.usage', {
              count: rows.length,
              size: formatBytes(usage.bytes),
            })}
          </p>
        )}
        {rows.length === 0 ? (
          <p className="text-muted-foreground">{t('flowRuns.fileSafety.empty')}</p>
        ) : (
          <ul className="space-y-0.5">
            {rows.slice(0, 8).map((item) => (
              <li key={item.id} className="truncate">
                {ACTION_KEYS[item.action] ?? item.action} · {item.path} · {formatBytes(item.byteSize)}
              </li>
            ))}
          </ul>
        )}

        {preview && actionable === 0 && conflicts.length === 0 && (
          <p className="text-muted-foreground">{t('flowRuns.fileSafety.none')}</p>
        )}
        {conflicts.length > 0 && (
          <div className="text-amber-600">
            <p>{t('flowRuns.fileSafety.conflicts', { count: conflicts.length })}</p>
            <ul className="mt-0.5 space-y-0.5">
              {conflicts.slice(0, 5).map((item) => (
                <li key={item.path} className="truncate">
                  {item.path}
                </li>
              ))}
            </ul>
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={rollback.isPending}
              onClick={() => void run({ dryRun: true })}
            >
              {t('flowRuns.fileSafety.preview')}
            </Button>
            <Button
              size="sm"
              disabled={
                rollback.isPending || !preview || (actionable === 0 && conflicts.length === 0)
              }
              onClick={() =>
                void run(
                  conflicts.length > 0
                    ? { dryRun: false, force: conflicts.map((item) => item.path) }
                    : { dryRun: false },
                )
              }
            >
              {conflicts.length > 0
                ? t('flowRuns.fileSafety.force')
                : t('flowRuns.fileSafety.confirm')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPreview(null);
                void snapshots.refetch();
              }}
            >
              {t('flowRuns.fileSafety.refresh')}
            </Button>
          </div>
        )}
      </div>
    </details>
  );
}
