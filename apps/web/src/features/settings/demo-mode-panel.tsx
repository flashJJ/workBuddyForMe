'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { errorText } from '@/lib/i18n/resolve-error';
import { useSettings, useUpdateSettings } from '@/lib/hooks/use-settings';
import { QUERY_KEYS } from '@/lib/api/endpoints';
import { useI18n } from '@/lib/i18n/use-i18n';

/**
 * v2.4 M1：演示模式开关面板——一键开启 / 关闭演示模式。
 * 关闭会清理内置 demo 供应商与其 mock 模型（级联），并清空指向它们的默认模型。
 */
export function DemoModePanel() {
  const { t } = useI18n();
  const { data } = useSettings();
  const update = useUpdateSettings();
  const toast = useToast();
  const qc = useQueryClient();
  // 水合门控：按钮文案/状态色随查询结果变化，慢机下水合期间取到数据会与服务端
  // 首帧（默认未开启）不一致（React #425/#422）；挂载后再切真实状态。
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const enabled = mounted && data?.demoModeEnabled === true;

  const toggle = async () => {
    try {
      await update.mutateAsync({ demoModeEnabled: !enabled });
      await Promise.all([
        qc.invalidateQueries({ queryKey: QUERY_KEYS.providers }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.modelsAll }),
      ]);
      toast.success(
        enabled ? t('settings.demoMode.disabled') : t('settings.demoMode.enabled'),
      );
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'toast.saveFailed', withDetail: true }));
    }
  };

  return (
    <section className="rounded-lg border bg-card p-4" data-testid="demo-mode-panel">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-medium">{t('settings.demoMode.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('settings.demoMode.description')}</p>
        </div>
        <Button
          type="button"
          variant={enabled ? 'outline' : 'default'}
          onClick={() => void toggle()}
          disabled={update.isPending}
          data-testid="demo-mode-toggle"
        >
          {enabled ? t('settings.demoMode.disable') : t('settings.demoMode.enable')}
        </Button>
      </div>
      {enabled && (
        <p
          className="mt-2 text-xs text-amber-700 dark:text-amber-300"
          role="status"
          data-testid="demo-mode-on"
        >
          {t('settings.demoMode.onHint')}
        </p>
      )}
    </section>
  );
}
