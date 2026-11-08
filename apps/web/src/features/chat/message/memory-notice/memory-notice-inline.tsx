'use client';

import * as React from 'react';
import type { MemoryNotice } from '@wbfm/shared/types';
import { useToast } from '@/components/common/toast';
import { useMemoryMutations } from '@/lib/hooks/assistant';
import { useI18n } from '@/lib/i18n/use-i18n';

/**
 * v2.28 P1：助手消息末尾的内联约束提示。
 * 每条新约束只提示一次（由调用方按会话去重）；撤销复用 PATCH 归档语义，
 * 服务层会写入 actor='user' 的审计，下一轮召回不再注入。
 */
export function MemoryNoticeInline({ notices }: { notices?: MemoryNotice[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const { update } = useMemoryMutations();
  const [undone, setUndone] = React.useState<Set<string>>(() => new Set());
  if (!notices || notices.length === 0) return null;

  const undo = (id: string) => {
    update.mutate(
      { id, body: { status: 'archived' } },
      {
        onSuccess: () => setUndone((prev) => new Set(prev).add(id)),
        onError: () => toast.error(t('chatMessages.memoryNoticeFailed')),
      },
    );
  };

  return (
    <p className="mt-1 text-xs text-muted-foreground" data-testid="memory-notice">
      {t('chatMessages.memoryNoticePrefix')}
      {notices.map((notice, index) => (
        <React.Fragment key={notice.id}>
          {index > 0 && '；'}
          {notice.content}
          {' · '}
          {undone.has(notice.id) ? (
            <span className="text-muted-foreground/60">
              {t('chatMessages.memoryNoticeUndone')}
            </span>
          ) : (
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              data-testid="memory-notice-undo"
              onClick={() => undo(notice.id)}
            >
              {t('chatMessages.memoryNoticeUndo')}
            </button>
          )}
        </React.Fragment>
      ))}
    </p>
  );
}
