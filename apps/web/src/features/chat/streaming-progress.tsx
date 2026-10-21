'use client';

import * as React from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/use-i18n';
import {
  formatLatencySeconds,
  latencyTier,
} from '../onboarding/latency-tier';
import type { StreamTiming } from './chat-session.types';

/**
 * v2.4 M5 / P1-4：慢模型进度提示。
 * 等待首字超过 1.5s 显示已等待秒数，超过 5s 追加「停止 + 换模型/缩短上下文」建议；
 * 分档阈值复用 P0-1 首字自检（M0 §6 冻结），保证本地体感与首启结论同一口径。
 */
export function StreamingProgress({ timing }: { timing: StreamTiming }) {
  const { t } = useI18n();
  const waiting = timing.firstTokenAt === null;
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [waiting]);

  if (!waiting) {
    const first = timing.firstTokenAt! - timing.startedAt;
    return (
      <p
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
        data-testid="stream-progress"
        data-tier={latencyTier(first)}
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        {t('chat.stream.firstToken', { seconds: formatLatencySeconds(first) })}
        <span aria-hidden>·</span>
        {t('chat.stream.generating')}
      </p>
    );
  }

  const waited = Math.max(0, now - timing.startedAt);
  const tier = latencyTier(waited);
  const slow = tier === 'timeout';
  return (
    <div className="space-y-1" data-testid="stream-progress" data-tier={tier}>
      <p className={cn('flex items-center gap-1.5 text-[11px]', slow ? 'text-warning' : 'text-muted-foreground')}>
        {slow ? (
          <TriangleAlert className="h-3 w-3 shrink-0" />
        ) : (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
        )}
        {tier === 'smooth'
          ? t('chat.stream.thinking')
          : t('chat.stream.waiting', { seconds: formatLatencySeconds(waited) })}
      </p>
      {slow && <p className="text-[11px] text-muted-foreground">{t('chat.stream.slowAdvice')}</p>}
    </div>
  );
}

/** 首字延迟小指标（本地计时；完成后仍保留在当前轮助手消息头部） */
export function FirstTokenMetric({
  timing,
  className,
}: {
  timing: StreamTiming;
  className?: string;
}) {
  const { t } = useI18n();
  if (timing.firstTokenAt === null) return null;
  const first = timing.firstTokenAt - timing.startedAt;
  const tier = latencyTier(first);
  return (
    <span
      className={cn(
        'text-[10px]',
        tier === 'smooth' ? 'text-muted-foreground' : 'text-warning',
        className,
      )}
      title={t('chat.stream.firstTokenTitle')}
      data-testid="first-token-metric"
      data-tier={tier}
    >
      {t('chat.stream.firstToken', { seconds: formatLatencySeconds(first) })}
    </span>
  );
}
