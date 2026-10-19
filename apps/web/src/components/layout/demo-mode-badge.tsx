'use client';

import { useSettings } from '@/lib/hooks/use-settings';
import { useI18n } from '@/lib/i18n/use-i18n';

/**
 * v2.4 M1：演示模式全局徽标——仅在 settings.demoModeEnabled 为真时常显，
 * 明示「当前回复为本地模拟、并非真实模型」，可去设置页一键关闭。
 */
export function DemoModeBadge() {
  const { t } = useI18n();
  const { data } = useSettings();
  if (data?.demoModeEnabled !== true) return null;

  return (
    <span
      data-testid="demo-mode-badge"
      title={t('settings.demoMode.badgeHint')}
      className="hidden rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 md:inline-flex dark:text-amber-300"
    >
      {t('settings.demoMode.badgeLabel')}
    </span>
  );
}
