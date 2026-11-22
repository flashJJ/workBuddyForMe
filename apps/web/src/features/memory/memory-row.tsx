'use client';

import Link from 'next/link';
import type { Memory } from '@wbfm/shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import {
  MEMORY_KIND_BADGE,
  MEMORY_KIND_LABELS,
  MEMORY_STATUS_LABELS,
  formatMemoryDate,
  memorySourceHref,
} from './memory-labels';

/** v4.12：从面板外迁的单条记忆行（控制面板行数，行为不变） */
export function MemoryRow({
  memory,
  onEdit,
  onDelete,
  onPin,
  onWeight,
  onMerge,
  deleting,
  busy,
}: {
  memory: Memory;
  onEdit: () => void;
  onDelete: () => void;
  onPin: () => void;
  onWeight: (direction: 'up' | 'down') => void;
  onMerge: () => void;
  deleting: boolean;
  busy: boolean;
}) {
  const { t, locale } = useI18n();
  const sourceHref = memorySourceHref(memory);
  const unpinBlocked = memory.kind === 'constraint' && memory.pinned;
  return (
    <div
      data-testid="memory-item"
      className="flex items-start gap-3 rounded-lg border bg-ui-row p-3"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={MEMORY_KIND_BADGE[memory.kind]}>
            {t(MEMORY_KIND_LABELS[memory.kind])}
          </Badge>
          {memory.status !== 'active' && (
            <Badge variant="outline">{t(MEMORY_STATUS_LABELS[memory.status])}</Badge>
          )}
          {memory.pinned && <Badge variant="warning">{t('memory.pinned')}</Badge>}
          <span className="text-xs text-muted-foreground">
            {t('memory.importanceLine', {
              importance: memory.importance.toFixed(1),
              date: formatMemoryDate(memory.updatedAt, locale),
            })}
          </span>
        </div>
        <p className="break-words text-sm">{memory.content}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">          <span>
            {memory.recallCount > 0
              ? t('memory.recallCount', { count: memory.recallCount })
              : t('memory.neverRecalled')}
          </span>
          {memory.lastAccessedAt && (
            <span>
              {t('memory.lastRecalledAt', {
                date: formatMemoryDate(memory.lastAccessedAt, locale),
              })}
            </span>
          )}
          {sourceHref ? (
            <Link
              href={sourceHref}
              className="text-teal-600 hover:underline dark:text-teal-400"
              data-testid="memory-source-link"
            >
              {memory.sourceMessageId
                ? t('memory.openSourceMessage')
                : t('memory.openSourceConversation')}
            </Link>
          ) : (
            <span data-testid="memory-source-unknown">{t('memory.sourceUnknown')}</span>
          )}
        </div>
        {/* v4.21：用户治理——固定 / 升降权 / 合并（不自动执行其他动作） */}
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            data-testid="memory-pin"
            disabled={busy || unpinBlocked}
            title={unpinBlocked ? t('memory.constraintPinned') : undefined}
            onClick={onPin}
          >
            {memory.pinned ? t('memory.unpin') : t('memory.pin')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            data-testid="memory-upweight"
            disabled={busy || memory.importance >= 1}
            onClick={() => onWeight('up')}
          >
            {t('memory.upweight')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            data-testid="memory-downweight"
            disabled={busy || memory.importance <= 0}
            onClick={() => onWeight('down')}
          >
            {t('memory.downweight')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            data-testid="memory-merge"
            disabled={busy}
            onClick={onMerge}
          >
            {t('memory.merge')}
          </Button>
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          {t('common.actions.edit')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="memory-delete"
          disabled={deleting}
          onClick={onDelete}
        >
          {t('common.actions.delete')}
        </Button>
      </div>
    </div>
  );
}
