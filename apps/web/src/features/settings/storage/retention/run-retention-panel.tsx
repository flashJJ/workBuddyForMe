'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useIntl } from '@/lib/i18n/use-intl';
import {
  useFlowRunRetention,
  useFlowRunsCleanup,
  useFlowRunsHealth,
  useUpdateFlowRunRetention,
  type FlowRunRetentionPolicy,
} from '@/lib/hooks/flows';

/** v5.0 运行保留设置：策略编辑 + dry-run 预览 + 立即清理 */
export function RunRetentionPanel() {
  const { t } = useI18n();
  const intl = useIntl();
  const toast = useToast();
  const query = useFlowRunRetention();
  const health = useFlowRunsHealth();
  const update = useUpdateFlowRunRetention();
  const cleanup = useFlowRunsCleanup();
  const [draft, setDraft] = React.useState<FlowRunRetentionPolicy | null>(null);
  const [preview, setPreview] = React.useState<{ count: number; scanned: number } | null>(null);

  React.useEffect(() => {
    if (query.data && !draft) setDraft(query.data);
  }, [query.data, draft]);

  if (!draft) return null;
  const patch = (next: Partial<FlowRunRetentionPolicy>) => setDraft({ ...draft, ...next });

  const save = async () => {
    try {
      await update.mutateAsync(draft);
      toast.success(t('flowRuns.retention.saved'));
    } catch {
      toast.error(t('flowRuns.retention.failed'));
    }
  };

  const runPreview = async () => {
    const result = await cleanup.mutateAsync(true);
    setPreview({ count: result.removed, scanned: result.scanned });
  };

  const runCleanup = async () => {
    const result = await cleanup.mutateAsync(false);
    setPreview(null);
    toast.success(t('flowRuns.retention.done', { count: result.removed }));
  };

  const lastCleanup = health.data?.retention?.lastCleanupAt;

  return (
    <section className="space-y-3 rounded-lg border bg-ui-card p-4" data-testid="run-retention-panel">
      <header>
        <h3 className="text-sm font-medium">{t('flowRuns.retention.title')}</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {t('flowRuns.retention.description')}
        </p>
        {lastCleanup && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t('flowRuns.retention.lastCleanup', {
              time: intl.formatDateTime(lastCleanup, {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </p>
        )}
      </header>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-primary"
          checked={draft.enabled}
          onChange={(event) => patch({ enabled: event.target.checked })}
        />
        {t('flowRuns.retention.enabled')}
      </label>
      <div className="grid gap-2 text-xs sm:grid-cols-3">
        {(
          [
            ['successDays', draft.successDays, 1, 365],
            ['failureDays', draft.failureDays, 1, 365],
            ['maxPerWorkflow', draft.maxPerWorkflow, 50, 5000],
          ] as const
        ).map(([key, value, min, max]) => (
          <label key={key} className="space-y-1">
            <span className="text-muted-foreground">{t(`flowRuns.retention.${key}`)}</span>
            <input
              type="number"
              className="h-8 w-full rounded-md border bg-ui-control px-2"
              min={min}
              max={max}
              value={value}
              onChange={(event) => patch({ [key]: Number(event.target.value) })}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void save()} disabled={update.isPending}>
          {t('flowRuns.retention.save')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void runPreview()} disabled={cleanup.isPending}>
          {t('flowRuns.retention.dryRun')}
        </Button>
        {preview && (
          <>
            <span className="text-[11px] text-muted-foreground">
              {t('flowRuns.retention.preview', { count: preview.count, scanned: preview.scanned })}
            </span>
            <Button size="sm" variant="destructive" onClick={() => void runCleanup()} disabled={cleanup.isPending}>
              {t('flowRuns.retention.confirm')}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
