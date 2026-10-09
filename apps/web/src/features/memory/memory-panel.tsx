'use client';

import * as React from 'react';
import type { Memory, MemoryKind, MemoryStatus } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useMemories, useMemoryMutations } from '@/lib/hooks/use-memories';
import { useI18n } from '@/lib/i18n/use-i18n';
import {
  MEMORY_KIND_BADGE,
  MEMORY_KIND_LABELS,
  MEMORY_KIND_OPTIONS,
  MEMORY_STATUS_LABELS,
  formatMemoryDate,
} from './memory-labels';
import { MemoryFormDialog } from './memory-form-dialog';

type StatusFilter = '' | MemoryStatus;

function MemoryRow({
  memory,
  onEdit,
  onDelete,
  deleting,
}: {
  memory: Memory;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const { t, locale } = useI18n();
  return (
    <div
      data-testid="memory-item"
      className="flex items-start gap-3 rounded-lg border p-3"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={MEMORY_KIND_BADGE[memory.kind]}>
            {t(MEMORY_KIND_LABELS[memory.kind])}
          </Badge>
          {memory.status === 'archived' && (
            <Badge variant="outline">{t(MEMORY_STATUS_LABELS.archived)}</Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {t('memory.importanceLine', {
              importance: memory.importance.toFixed(1),
              date: formatMemoryDate(memory.updatedAt, locale),
            })}
          </span>
        </div>
        <p className="break-words text-sm">{memory.content}</p>
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

/** 设置页：长期记忆库管理（搜索/筛选/增改删/清空） */
export function MemoryPanel() {
  const { t } = useI18n();
  const [search, setSearch] = React.useState('');
  const [kind, setKind] = React.useState<'' | MemoryKind>('');
  const [status, setStatus] = React.useState<StatusFilter>('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Memory | null>(null);

  const filter = {
    limit: 200,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(kind ? { kind } : {}),
    ...(status ? { status } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const { data: memories, isLoading, isError, refetch } = useMemories(filter);
  const mutations = useMemoryMutations();
  const toast = useToast();
  const confirm = useConfirm();

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (memory: Memory) => {
    setEditing(memory);
    setDialogOpen(true);
  };

  const remove = async (memory: Memory) => {
    if (
      !(await confirm({
        title: t('memory.deleteTitle'),
        description: t('memory.deleteConfirm', { content: memory.content }),
        confirmText: t('common.actions.delete'),
        danger: true,
      }))
    ) {
      return;
    }
    try {
      await mutations.remove.mutateAsync(memory.id);
      toast.success(t('memory.deleted'));
    } catch {
      toast.error(t('memory.deleteFailed'));
    }
  };

  const clearAll = async () => {
    if (
      !(await confirm({
        title: t('memory.clearTitle'),
        description: t('memory.clearConfirm'),
        confirmText: t('memory.clearConfirmText'),
        danger: true,
      }))
    ) {
      return;
    }
    try {
      const result = await mutations.clear.mutateAsync();
      toast.success(t('memory.cleared', { count: result.removed }));
    } catch {
      toast.error(t('memory.clearFailed'));
    }
  };

  return (
    <section className="space-y-3 rounded-xl border p-4" data-testid="memory-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{t('memory.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('memory.description')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={openCreate}>
            {t('memory.add')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="memory-clear"
            disabled={!memories?.length}
            onClick={() => void clearAll()}
          >
            {t('memory.clear')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          aria-label={t('memory.searchAria')}
          placeholder={t('memory.searchPlaceholder')}
          value={search}
          className="h-9 max-w-xs"
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          aria-label={t('memory.kindFilterAria')}
          className="h-9 w-28"
          value={kind}
          onChange={(e) => setKind(e.target.value as '' | MemoryKind)}
        >
          <option value="">{t('memory.kindFilterAll')}</option>
          {MEMORY_KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t('memory.statusFilterAria')}
          className="h-9 w-28"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="">{t('memory.statusFilterAll')}</option>
          <option value="active">{t(MEMORY_STATUS_LABELS.active)}</option>
          <option value="archived">{t(MEMORY_STATUS_LABELS.archived)}</option>
        </Select>
        <Input
          aria-label={t('memory.fromAria')}
          type="date"
          className="h-9 w-40"
          value={from}
          max={to || undefined}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input
          aria-label={t('memory.toAria')}
          type="date"
          className="h-9 w-40"
          value={to}
          min={from || undefined}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>

      {isLoading && <Spinner />}
      {isError && <ErrorState message={t('memory.loadError')} onRetry={() => void refetch()} />}
      {!isLoading && !isError && memories && (
        <div className="space-y-2" data-testid="memory-list">
          {memories.length === 0 ? (
            <EmptyState
              title={t('memory.empty.title')}
              description={t('memory.empty.description')}
            />
          ) : (
            memories.map((memory) => (
              <MemoryRow
                key={memory.id}
                memory={memory}
                onEdit={() => openEdit(memory)}
                onDelete={() => void remove(memory)}
                deleting={mutations.remove.isPending}
              />
            ))
          )}
        </div>
      )}

      <MemoryFormDialog open={dialogOpen} onOpenChange={setDialogOpen} memory={editing} />
    </section>
  );
}
