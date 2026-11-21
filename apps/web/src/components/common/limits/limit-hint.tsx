'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  current: number;
  limit: number;
  className?: string;
}

/**
 * v4.17 限制可视化：达到上限时说明「已满 N」，否则提示还能选几项。
 * 所有用户可多选字段共用，禁止保存时静默截断。
 */
export function LimitHint({ current, limit, className }: Props) {
  const { t } = useI18n();
  const reached = current >= limit;
  return (
    <p
      className={cn('text-xs text-muted-foreground', reached && 'text-warning', className)}
      data-testid="limit-hint"
      data-reached={reached ? 'true' : 'false'}
    >
      {reached
        ? t('common.limit.reached', { max: limit })
        : t('common.limit.remaining', { count: Math.max(limit - current, 0) })}
    </p>
  );
}
