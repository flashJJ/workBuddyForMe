'use client';

import { useI18n } from '@/lib/i18n/use-i18n';

/** 键盘用户首站：视觉隐藏，聚焦时显现（服务端布局内的客户端小岛） */
export function SkipLink() {
  const { t } = useI18n();
  return (
    <a href="#main-content" className="skip-link">
      {t('common.skipToContent')}
    </a>
  );
}
