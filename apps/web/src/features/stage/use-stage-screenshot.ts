'use client';

import * as React from 'react';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useToast } from '@/components/common/toast';
import { getStageBridge } from './stage-bridge';

/**
 * 无 UI 截图（v1.9 M1）：仅桌面舞台窗可用。
 * 先临时隐 UI 等一帧让主进程抓到干净画面，capturePage 结束后恢复。
 * 浏览器裸访给降级 toast，不报错。
 */
export function useStageScreenshot(
  setUiHidden: (hidden: boolean) => void,
): () => Promise<'saved' | 'canceled' | 'unsupported'> {
  const { t } = useI18n();
  const toast = useToast();

  return React.useCallback(async () => {
    const bridge = getStageBridge();
    if (!bridge) {
      toast.error(t('stage.ui.screenshotUnsupported'));
      return 'unsupported' as const;
    }
    setUiHidden(true);
    // 等一帧让 UI 隐藏渲染完成，主进程截到的才是无 UI 画面
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const result = await bridge.capture();
    setUiHidden(false);
    if (result.canceled) toast.info?.(t('stage.ui.screenshotCanceled'));
    else toast.success(t('stage.ui.screenshotSaved'));
    return result.canceled ? ('canceled' as const) : ('saved' as const);
  }, [setUiHidden, t, toast]);
}
