'use client';

import * as React from 'react';
import { useI18n } from '@/lib/i18n/use-i18n';
import { CITATION_FOCUS_EVENT } from './citation-markers';

/**
 * v2.27：正文行内引用角标。
 * 点击后向所在消息节点派发聚焦事件，由来源列表展开并滚动高亮；
 * 找不到对应来源时降级为纯文本并说明「引用不可用」。
 */
export function CitationRef({ index, available }: { index: number; available: boolean }) {
  const { t } = useI18n();
  if (!available) {
    return (
      <span
        className="mx-0.5 text-xs text-muted-foreground"
        title={t('chatMessages.citationUnavailable')}
        data-testid="citation-ref-unavailable"
      >
        [{index}]
      </span>
    );
  }
  return (
    <button
      type="button"
      className="mx-0.5 rounded bg-primary/10 px-1 align-super text-[0.7em] font-medium leading-normal text-primary transition-colors hover:bg-primary/20"
      aria-label={t('chatMessages.citationRef', { index })}
      title={t('chatMessages.citationRef', { index })}
      data-testid="citation-ref"
      data-cite-ref={index}
      onClick={(event) => {
        const root = event.currentTarget.closest('[data-message-id]');
        if (!root) return;
        root.dispatchEvent(
          new CustomEvent(CITATION_FOCUS_EVENT, { detail: { index }, bubbles: true }),
        );
      }}
    >
      [{index}]
    </button>
  );
}
