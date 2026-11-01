'use client';

import * as React from 'react';
import { useI18n } from '@/lib/i18n/use-i18n';

/**
 * v1.7 演出跳过层：演出中覆盖舞台的透明点击层。
 * - 点击任意处 = 跳过（runner 记 user_skip，无惩罚）；
 * - 底部中央给「跳过」提示胶囊；fx/字幕层在其下方（z-10/z-20，本层 z-30）；
 * - 不挡 Esc（全局监听）；aria-label 保证可访问名。
 */
export function EventSkipOverlay({ onSkip }: { onSkip: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      aria-label={t('event.ui.skip')}
      data-testid="event-skip-overlay"
      onClick={onSkip}
      className="absolute inset-0 z-30 cursor-pointer bg-transparent"
    >
      <span className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
        <span className="rounded-full border border-border/50 bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm">
          {t('event.ui.skip')} · Esc
        </span>
      </span>
    </button>
  );
}
