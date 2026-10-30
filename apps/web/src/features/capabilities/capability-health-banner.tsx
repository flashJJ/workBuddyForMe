'use client';

import type { CapabilityHealthReport } from '@wbfm/shared/schemas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  report: CapabilityHealthReport | undefined;
  checking: boolean;
  cleaning: boolean;
  onCheck: () => void;
  onCleanup: () => Promise<void>;
}

/** v2.12：健康自检结果、问题明细与无主目录清理入口 */
export function CapabilityHealthBanner({
  report,
  checking,
  cleaning,
  onCheck,
  onCleanup,
}: Props) {
  const { t } = useI18n();
  const confirm = useConfirm();

  const broken = report?.packs.filter((item) => item.status === 'broken').length ?? 0;
  const warnings = report?.packs.filter((item) => item.status === 'warning').length ?? 0;
  const issues = report?.packs.filter((item) => item.issues.length > 0) ?? [];

  return (
    <section
      className="space-y-3 rounded-lg border border-dashed p-4"
      data-testid="capability-health-banner"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium">{t('capabilities.health.title')}</h2>
        <Button size="sm" variant="outline" data-testid="capability-health-check" disabled={checking} onClick={onCheck}>
          {checking ? t('capabilities.health.checking') : t('capabilities.health.check')}
        </Button>
        {report ? (
          <span className="text-xs text-muted-foreground" data-testid="capability-health-summary">
            {broken} {t('capabilities.health.broken')} · {warnings} {t('capabilities.health.warning')}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{t('capabilities.health.notChecked')}</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t('capabilities.health.hint')}</p>

      {issues.length > 0 && (
        <ul className="space-y-2" data-testid="capability-health-issues">
          {issues.map((pack) => (
            <li key={pack.id} className="rounded-md border bg-muted/20 p-2 text-xs">
              <div className="flex items-center gap-2">
                <Badge variant={pack.status === 'broken' ? 'danger' : 'warning'}>
                  {t(`capabilities.health.${pack.status}`)}
                </Badge>
                <span className="font-medium">{pack.id}</span>
              </div>
              <ul className="mt-1 space-y-0.5">
                {pack.issues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`} className="text-muted-foreground">
                    [{issue.severity}] {issue.message}
                    {issue.detail ? ` (${issue.detail})` : ''}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {report && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground" data-testid="capability-orphans">
            {t('capabilities.health.orphan')}:{' '}
            {report.orphans.length > 0 ? report.orphans.join(', ') : t('capabilities.health.noOrphan')}
          </span>
          {report.orphans.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              data-testid="capability-cleanup-button"
              disabled={cleaning}
              onClick={async () => {
                if (
                  await confirm({
                    title: t('capabilities.health.cleanup'),
                    description: report.orphans.join(', '),
                    danger: true,
                  })
                ) {
                  await onCleanup();
                }
              }}
            >
              {t('capabilities.health.cleanup')}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
