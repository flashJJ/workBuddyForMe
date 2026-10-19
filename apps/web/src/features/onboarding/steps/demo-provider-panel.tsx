'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { errorText } from '@/lib/i18n/resolve-error';
import { useUpdateSettings } from '@/lib/hooks/use-settings';
import { QUERY_KEYS } from '@/lib/api/endpoints';
import { useI18n } from '@/lib/i18n/use-i18n';

/**
 * v2.4 M1 向导第 2 步 · 演示模式面板：
 * 一键开启演示模式（内置 demo 供应商 + mock 模型），不填任何 Key 即可对话。
 * 复用正式设置链路；开启后 demo 供应商/模型需刷新 providers 与 models 查询。
 */
export function DemoProviderPanel({ onReady }: { onReady: () => void }) {
  const { t } = useI18n();
  const update = useUpdateSettings();
  const qc = useQueryClient();
  const [ready, setReady] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');

  const enable = async () => {
    setErrorMsg('');
    try {
      await update.mutateAsync({ demoModeEnabled: true });
      await Promise.all([
        qc.invalidateQueries({ queryKey: QUERY_KEYS.providers }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.modelsAll }),
      ]);
      setReady(true);
      onReady();
    } catch (error) {
      setErrorMsg(errorText(error, t, { fallback: 'toast.saveFailed', withDetail: true }));
    }
  };

  return (
    <div className="space-y-3" data-testid="onboarding-demo">
      <p className="text-sm text-muted-foreground">{t('onboarding.provider.demoLead')}</p>
      <Button
        type="button"
        onClick={() => void enable()}
        disabled={update.isPending || ready}
        data-testid="ob-demo-enable"
      >
        {update.isPending ? t('onboarding.provider.demoEnabling') : t('onboarding.provider.demoEnable')}
      </Button>
      {ready && (
        <p
          className="text-xs text-emerald-600 dark:text-emerald-400"
          role="status"
          data-testid="ob-demo-ready"
        >
          {t('onboarding.provider.demoReady')}
        </p>
      )}
      {errorMsg && (
        <p className="text-xs text-destructive" role="alert">
          {t('onboarding.provider.demoFailed', { message: errorMsg })}
        </p>
      )}
    </div>
  );
}
