'use client';

import * as React from 'react';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Button } from '@/components/ui/button';
import { useFirstTokenProbe, type FirstTokenProbeReport } from '@/lib/hooks/use-first-token-probe';
import { useI18n } from '@/lib/i18n/use-i18n';
import { formatLatencySeconds, latencyTier, type LatencyTier } from '../latency-tier';

/** 分档 → i18n 键（动态 t() 需要编译期合法键） */
const TIER_KEYS: Record<LatencyTier, MessageKey> = {
  smooth: 'onboarding.latency.smooth',
  slow: 'onboarding.latency.slow',
  timeout: 'onboarding.latency.timeout',
};

/**
 * v2.4 M1 T5：来源就绪后的首字延迟自检结论。
 * 只测当前已选定的来源（由 providerId 指定），固定极短 prompt、不含用户数据；
 * 给出人话结论与「换一个来源」出口（清空结论，回到上方来源页签重选）。
 */
export function LatencyProbe({ providerId }: { providerId: string }) {
  const { t } = useI18n();
  const { mutate } = useFirstTokenProbe();
  const [report, setReport] = React.useState<FirstTokenProbeReport | null>(null);
  const [dismissed, setDismissed] = React.useState(false);
  const probedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!providerId || probedRef.current === providerId) return;
    probedRef.current = providerId;
    setDismissed(false);
    setReport(null);
    mutate(providerId, {
      onSuccess: (data) => setReport(data),
      // 自检请求本身失败（网络/超时归一化）：按未取到首字处理
      onError: () => setReport({ measurable: true, ok: false, firstTokenMs: null, totalMs: null }),
    });
  }, [providerId, mutate]);

  if (dismissed) return null;

  if (!report) {
    return (
      <p className="text-xs text-muted-foreground" role="status" data-testid="ob-latency-probing">
        {t('onboarding.latency.probing')}
      </p>
    );
  }
  // 该来源暂无可用于自检的对话模型：不给出结论（避免误导）
  if (!report.measurable) return null;

  const ms = report.firstTokenMs;
  const message =
    ms === null
      ? t('onboarding.latency.timeout')
      : t(TIER_KEYS[latencyTier(ms)], { seconds: formatLatencySeconds(ms) });

  return (
    <div
      className="space-y-2 rounded-md border bg-muted/40 p-3"
      data-testid="ob-latency-probe"
    >
      <p className="text-xs text-foreground" role="status" data-testid="ob-latency-conclusion">
        {message}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setDismissed(true)}
        data-testid="ob-latency-switch"
      >
        {t('onboarding.latency.switchSource')}
      </Button>
    </div>
  );
}
