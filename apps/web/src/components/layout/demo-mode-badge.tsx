'use client';

import { Badge } from '@/components/ui/badge';
import { useSettings } from '@/lib/hooks/use-settings';
import { useI18n } from '@/lib/i18n/use-i18n';

/**
 * v2.4 M1：演示模式全局徽标——仅在 settings.demoModeEnabled 为真时常显，
 * 明示「当前回复为本地模拟、并非真实模型」，可去设置页一键关闭。
 * 用设计系统 Badge（语义色变量，明暗两套均已过 a11y 对比度）。
 */
export function DemoModeBadge() {
  const { t } = useI18n();
  const { data } = useSettings();
  if (data?.demoModeEnabled !== true) return null;

  return (
    <Badge
      variant="warning"
      data-testid="demo-mode-badge"
      title={t('settings.demoMode.badgeHint')}
      className="hidden md:inline-flex"
    >
      {t('settings.demoMode.badgeLabel')}
    </Badge>
  );
}
