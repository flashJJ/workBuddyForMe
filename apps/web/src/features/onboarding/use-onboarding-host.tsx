'use client';

import * as React from 'react';
import { useSettings, useUpdateSettings } from '@/lib/hooks/use-settings';
import { OnboardingDialog } from './onboarding-dialog';

/**
 * 首启向导宿主（v1.2 M5）：
 * - 自动门控：设置加载完成且 hasOnboarded=false 时自动弹一次（首装机；老用户由 v016 回填 true）
 * - 手动重放：window CustomEvent('onboarding:open')，设置页「关于」按钮触发
 * - 完成/跳过：写 hasOnboarded=true 并关闭；写入失败不阻断关闭（下次启动会再弹）
 */
export const ONBOARDING_OPEN_EVENT = 'onboarding:open';

export function OnboardingHost() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const [open, setOpen] = React.useState(false);
  const autoCheckedRef = React.useRef(false);

  // 自动门控只在 settings 首次到位时判定一次，避免重放后被立即关闭
  React.useEffect(() => {
    if (isLoading || !settings || autoCheckedRef.current) return;
    autoCheckedRef.current = true;
    if (!settings.hasOnboarded) setOpen(true);
  }, [isLoading, settings]);

  React.useEffect(() => {
    const onOpenEvent = () => setOpen(true);
    window.addEventListener(ONBOARDING_OPEN_EVENT, onOpenEvent);
    return () => window.removeEventListener(ONBOARDING_OPEN_EVENT, onOpenEvent);
  }, []);

  const handleComplete = React.useCallback(() => {
    setOpen(false);
    if (!settings?.hasOnboarded) {
      updateSettings.mutate({ hasOnboarded: true });
    }
  }, [settings, updateSettings]);

  return <OnboardingDialog open={open} onComplete={handleComplete} />;
}

/** 非宿主组件（关于面板按钮等）命令式重放首启向导 */
export function reopenOnboarding(): void {
  window.dispatchEvent(new CustomEvent(ONBOARDING_OPEN_EVENT));
}
