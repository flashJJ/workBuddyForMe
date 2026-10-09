'use client';

import { Spinner } from '@/components/common/state';
import { useI18n } from '@/lib/i18n/use-i18n';

/** 路由级加载骨架（App Router Suspense 兜底） */
export default function MainLoading() {
  const { t } = useI18n();
  return <Spinner label={t('common.pageLoading')} />;
}
