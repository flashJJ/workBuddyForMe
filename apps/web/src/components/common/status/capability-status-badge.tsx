'use client';

import * as React from 'react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/use-i18n';

export type CapabilityStatus = 'available' | 'enabled' | 'disabled' | 'error';

const VARIANT: Record<CapabilityStatus, NonNullable<BadgeProps['variant']>> = {
  available: 'info',
  enabled: 'success',
  disabled: 'outline',
  error: 'danger',
};

const KEY = {
  available: 'common.status.available',
  enabled: 'common.status.enabled',
  disabled: 'common.status.disabled',
  error: 'common.status.error',
} as const;

/**
 * v4.17 能力三态统一：可用 / 已启用 / 已停用 / 异常。
 * 一个徽标只表达一种含义，避免「已安装」同时可勾选（B-64 泛化）。
 */
export function CapabilityStatusBadge({
  status,
  size = 'sm',
  className,
  label,
}: {
  status: CapabilityStatus;
  size?: BadgeProps['size'];
  className?: string;
  /** 允许调用方沿用自身文案，只统一颜色与语义 */
  label?: string;
}) {
  const { t } = useI18n();
  return (
    <Badge
      variant={VARIANT[status]}
      size={size}
      className={className}
      data-testid="capability-status"
      data-status={status}
    >
      {label ?? t(KEY[status])}
    </Badge>
  );
}
