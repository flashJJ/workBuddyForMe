'use client';

import * as React from 'react';
import type { Memory, MemoryKind, MemoryStatus } from '@wbfm/shared/types';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/simple-select';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useMemories, useMemoryMutations, useMemoryStats } from '@/lib/hooks/assistant';
import { errorText } from '@/lib/i18n/resolve-error';
import { useI18n } from '@/lib/i18n/use-i18n';
import { MEMORY_KIND_OPTIONS, MEMORY_STATUS_LABELS } from './memory-labels';
import { MemoryFormDialog } from './memory-form-dialog';
import { MemoryMergeDialog } from './memory-merge-dialog';
import { MemoryStatsCard } from './memory-stats-card';
import { MemoryRow } from './memory-row';

type StatusFilter = '' | MemoryStatus;

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
  const [mergeTarget, setMergeTarget] = React.useState<Memory | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const filter = {
    limit: 200,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(kind ? { kind } : {}),
    ...(status ? { status } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const { data: memories, isLoading, isError, refetch } = useMemories(filter);
  const { data: stats } = useMemoryStats();
  const archivedCount = stats?.archived ?? 0;
  const mutations = useMemoryMutations();
  const toast = useToast();
  const confirm = useConfirm();
  // 水合门控：查询态在 SSR 与客户端首帧不一致，直接据此切结构会水合失配（React #418/#422）。
  // 筛选栏是本地状态派生（两帧一致），无需门控。
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (memory: Memory) => {
    setEditing(memory);
    setDialogOpen(true);
  };

  // v4.21：治理动作统一走 PATCH；失败内联提示，不阻断列表
  const govern = async (
    memory: Memory,
    body: { pinned?: boolean; weight?: 'up' | 'down'; mergeIds?: string[] },
    fallback: MessageKey,
    success: string,
  ) => {
    setActionError(null);
    try {
      await mutations.update.mutateAsync({ id: memory.id, body });
      toast.success(success);
      return true;
    } catch (error) {
      setActionError(errorText(error, t, { fallback, withDetail: true }));
      return false;
    }
  };

  const mergeMemories = async (ids: string[]) => {
    if (!mergeTarget) return;
    const ok = await govern(
      mergeTarget,
      { mergeIds: ids },
      'memory.mergeFailed',
      t('memory.merged', { count: ids.length }),
    );
    if (ok) setMergeTarget(null);
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
      const result = await mutations.clear.mutateAsync({});
      toast.success(t('memory.cleared', { count: result.removed }));
    } catch {
      toast.error(t('memory.clearFailed'));
    }
  };

  const clearArchived = async () => {
    if (
      !(await confirm({
        title: t('memory.clearArchivedTitle'),
        description: t('memory.clearArchivedConfirm'),
        confirmText: t('memory.clearArchivedConfirmText'),
        danger: true,
      }))
    ) {
      return;
    }
    try {
      const result = await mutations.clear.mutateAsync({ status: 'archived' });
      toast.success(t('memory.cleared', { count: result.removed }));
    } catch {
      toast.error(t('memory.clearFailed'));
    }
  };

  return (
    <section className="space-y-3 rounded-lg border bg-ui-card p-4" data-testid="memory-panel">
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
            data-testid="memory-clear-archived"
            disabled={archivedCount === 0 || mutations.clear.isPending}
            title={archivedCount === 0 ? t('memory.clearArchivedNone') : undefined}
            onClick={() => void clearArchived()}
          >
            {t('memory.clearArchived')}
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

      <MemoryStatsCard />

      <div className="flex flex-wrap gap-2">
        <Input
          aria-label={t('memory.searchAria')}
          placeholder={t('memory.searchPlaceholder')}
          value={search}
          className="h-9 max-w-xs"
          onChange={(e) => setSearch(e.target.value)}
        />
        <SimpleSelect
          aria-label={t('memory.kindFilterAria')}
          className="h-9 w-28"
          value={kind}
          onValueChange={(v) => setKind(v as '' | MemoryKind)}
        >
          <option value="">{t('memory.kindFilterAll')}</option>
          {MEMORY_KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </SimpleSelect>
        <SimpleSelect
          aria-label={t('memory.statusFilterAria')}
          className="h-9 w-28"
          value={status}
          onValueChange={(v) => setStatus(v as StatusFilter)}
        >
          <option value="">{t('memory.statusFilterAll')}</option>
          <option value="active">{t(MEMORY_STATUS_LABELS.active)}</option>
          <option value="archived">{t(MEMORY_STATUS_LABELS.archived)}</option>
        </SimpleSelect>
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

      {actionError ? (
        <p className="text-xs text-destructive" role="alert" data-testid="memory-action-error">
          {actionError}
        </p>
      ) : null}

      {mounted && isLoading && <Spinner />}
      {mounted && isError && (
        <ErrorState message={t('memory.loadError')} onRetry={() => void refetch()} />
      )}
      {mounted && !isLoading && !isError && memories && (
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
                onPin={() =>
                  void govern(
                    memory,
                    { pinned: !memory.pinned },
                    'memory.pinFailed',
                    t(memory.pinned ? 'memory.unpin' : 'memory.pin'),
                  )
                }
                onWeight={(direction) =>
                  void govern(
                    memory,
                    { weight: direction },
                    'memory.weightFailed',
                    t(direction === 'up' ? 'memory.upweight' : 'memory.downweight'),
                  )
                }
                onMerge={() => setMergeTarget(memory)}
                deleting={mutations.remove.isPending}
                busy={mutations.update.isPending}
              />
            ))
          )}
        </div>
      )}

      <MemoryFormDialog open={dialogOpen} onOpenChange={setDialogOpen} memory={editing} />
      <MemoryMergeDialog
        open={mergeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setMergeTarget(null);
        }}
        target={mergeTarget}
        candidates={memories ?? []}
        onConfirm={mergeMemories}
        busy={mutations.update.isPending}
      />
    </section>
  );
}
