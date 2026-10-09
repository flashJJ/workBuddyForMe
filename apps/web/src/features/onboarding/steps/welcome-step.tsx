'use client';

import { useI18n } from '@/lib/i18n/use-i18n';

/**
 * 向导第 1 步：欢迎与本地优先/隐私/离线说明（纯展示）。
 */
export function WelcomeStep() {
  const { t } = useI18n();
  const bullets = [
    t('onboarding.welcome.bulletLocal'),
    t('onboarding.welcome.bulletPrivate'),
    t('onboarding.welcome.bulletFree'),
  ];

  return (
    <div className="space-y-4" data-testid="onboarding-welcome">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('onboarding.welcome.heading')}</h2>
        <p className="text-sm text-muted-foreground">{t('onboarding.welcome.lead')}</p>
      </div>
      <ul className="space-y-2">
        {bullets.map((text) => (
          <li key={text} className="flex items-start gap-2 text-sm">
            <span aria-hidden className="mt-0.5 text-primary">
              ✓
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
