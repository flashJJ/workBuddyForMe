'use client';

import * as React from 'react';
import Link from 'next/link';
import { Brain, ChevronDown, ChevronUp } from 'lucide-react';
import type { RecalledMemoryPayload } from '@wbfm/shared/api';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/use-i18n';
import {
  MEMORY_KIND_BADGE,
  MEMORY_KIND_LABELS,
  MEMORY_RECALL_REASON_LABELS,
  memorySourceHref,
  recallLevelKey,
} from '../memory/memory-labels';

/**
 * v2.6 M4：本轮召回的长期记忆 chips。
 * 折叠只显示数量；展开后逐条展示类别、内容、来源会话/消息与召回理由（高/中/低档）。
 */
export function RecalledMemoriesBar({ memories }: { memories: RecalledMemoryPayload[] }) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  if (memories.length === 0) return null;

  return (
    <div
      data-testid="recalled-memories"
      className="mx-auto mt-2 w-full max-w-3xl rounded-lg border bg-muted/40 text-xs"
    >
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-1 text-muted-foreground"
        aria-expanded={open}
        data-testid="recalled-memories-toggle"
        onClick={() => setOpen((value) => !value)}
      >
        <Brain className="h-3 w-3" />
        {t('chat.recalledMemoriesHint', { count: memories.length })}
        {open ? (
          <ChevronUp className="ml-auto h-3 w-3" />
        ) : (
          <ChevronDown className="ml-auto h-3 w-3" />
        )}
      </button>
      {open && (
        <ul className="space-y-1.5 border-t px-3 py-2">
          {memories.map((memory) => {
            const href = memorySourceHref(memory);
            return (
              <li key={memory.id} data-testid="recalled-memory-item" className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={MEMORY_KIND_BADGE[memory.kind]}>
                    {t(MEMORY_KIND_LABELS[memory.kind])}
                  </Badge>
                  <span className="text-muted-foreground">
                    {t('memory.recallSummary', {
                      reason: t(MEMORY_RECALL_REASON_LABELS[memory.reason]),
                      level: t(recallLevelKey(memory.score)),
                    })}
                  </span>
                  {href ? (
                    <Link
                      href={href}
                      className="text-teal-600 hover:underline dark:text-teal-400"
                      data-testid="recalled-memory-source"
                    >
                      {memory.sourceMessageId
                        ? t('memory.openSourceMessage')
                        : t('memory.openSourceConversation')}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground" data-testid="recalled-memory-source-unknown">
                      {t('memory.sourceUnknown')}
                    </span>
                  )}
                </div>
                <p className="break-words text-muted-foreground">{memory.content}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
