'use client';

import { useI18n } from '@/lib/i18n/use-i18n';

/**
 * v2.4 P0-1（T4）：未检测到 Ollama 时的**可执行指引**
 * （winget 命令行安装 + 官网下载 + 拉取示例模型 + 回去重新检测）。
 */
export function OllamaInstallGuide({ errorMsg }: { errorMsg: string }) {
  const { t } = useI18n();

  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs" role="alert" data-testid="ob-ollama-install">
      <p className="font-medium text-foreground">{t('onboarding.provider.offline')}</p>
      <p className="text-muted-foreground">
        {t('onboarding.provider.installWingetLead')}
      </p>
      <pre
        className="overflow-x-auto rounded bg-background p-2 font-mono"
        data-testid="ob-ollama-winget"
      >
        {t('onboarding.provider.installWinget')}
      </pre>
      <p className="text-muted-foreground">
        {t('onboarding.provider.installLead')}{' '}
        <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="underline">
          {t('onboarding.provider.installLink')}
        </a>
        {t('onboarding.provider.installMid')}
      </p>
      <pre className="overflow-x-auto rounded bg-background p-2 font-mono">
        {t('onboarding.provider.pullCommand')}
      </pre>
      <p className="text-muted-foreground">{t('onboarding.provider.installTail')}</p>
      {errorMsg && <p className="text-destructive">{errorMsg}</p>}
    </div>
  );
}
