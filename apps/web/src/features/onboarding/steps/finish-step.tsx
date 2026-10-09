'use client';

import { useI18n } from '@/lib/i18n/use-i18n';

/**
 * 向导第 4 步：完成提示（命令面板 / 语音 / 设置入口）。「进入应用」由容器底部按钮承担。
 */
export function FinishStep() {
  const { t } = useI18n();
  const hints = [
    t('onboarding.finish.hintCommand'),
    t('onboarding.finish.hintVoice'),
    t('onboarding.finish.hintSettings'),
  ];

  return (
    <div className="space-y-4" data-testid="onboarding-finish">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('onboarding.finish.heading')}</h2>
        <p className="text-sm text-muted-foreground">{t('onboarding.finish.lead')}</p>
      </div>
      <ul className="space-y-2">
        {hints.map((text) => (
          <li key={text} className="flex items-start gap-2 text-sm">
            <span aria-hidden className="mt-0.5 text-primary">
              •
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
