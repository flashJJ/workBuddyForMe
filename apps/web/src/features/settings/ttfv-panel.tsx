'use client';

import type { MessageKey } from '@wbfm/shared/i18n';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { useSettings, useUpdateSettings } from '@/lib/hooks/use-settings';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useIntl } from '@/lib/i18n/use-intl';

/** 单个里程碑时间戳行（未记录显示占位符） */
function MilestoneRow({
  labelKey,
  testId,
  at,
}: {
  labelKey: MessageKey;
  testId: string;
  at: number | null;
}) {
  const { t } = useI18n();
  const intl = useIntl();
  return (
    <div>
      <span className="block text-xs text-muted-foreground">{t(labelKey)}</span>
      <span className="font-mono text-xs" data-testid={testId}>
        {at === null ? '—' : intl.formatDateTime(at)}
      </span>
    </div>
  );
}

/**
 * v2.4 M1 T7：关于页 TTFV 里程碑（首次启动 → 模型就绪 → 首次回答）。
 * 仅记录时间戳、不含任何对话内容；可一键清除（显式传 null）。
 */
export function TtfvPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const { data } = useSettings();
  const update = useUpdateSettings();

  const launch = data?.firstLaunchAt ?? null;
  const modelReady = data?.firstModelReadyAt ?? null;
  const firstAnswer = data?.firstAnswerAt ?? null;
  const ttfvMs = data?.ttfvMs ?? null;

  const clear = () => {
    update.mutate(
      { firstLaunchAt: null, firstModelReadyAt: null, firstAnswerAt: null, ttfvMs: null },
      { onSuccess: () => toast.success(t('about.ttfv.cleared')) },
    );
  };

  return (
    <div className="space-y-2 border-t pt-3" data-testid="about-ttfv">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{t('about.ttfv.title')}</span>
        {ttfvMs !== null && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clear}
            data-testid="about-ttfv-clear"
          >
            {t('about.ttfv.clear')}
          </Button>
        )}
      </div>

      {ttfvMs === null ? (
        <p className="text-xs text-muted-foreground">{t('about.ttfv.empty')}</p>
      ) : (
        <p className="text-xs text-foreground" data-testid="about-ttfv-value">
          {t('about.ttfv.value')}{' '}
          {t('about.ttfv.seconds', { seconds: (ttfvMs / 1000).toFixed(1) })}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <MilestoneRow labelKey="about.ttfv.launch" testId="about-ttfv-launch" at={launch} />
        <MilestoneRow labelKey="about.ttfv.modelReady" testId="about-ttfv-model-ready" at={modelReady} />
        <MilestoneRow
          labelKey="about.ttfv.firstAnswer"
          testId="about-ttfv-first-answer"
          at={firstAnswer}
        />
      </div>
    </div>
  );
}
