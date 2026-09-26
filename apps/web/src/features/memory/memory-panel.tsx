'use client';

import * as React from 'react';
import type { Memory, MemoryKind, MemoryStatus } from '@wbfm/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { useMemories, useMemoryMutations } from '@/lib/hooks/use-memories';
import {
  MEMORY_KIND_BADGE,
  MEMORY_KIND_LABELS,
  MEMORY_KIND_OPTIONS,
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
  return (
    <div
      data-testid="memory-item"
      className="flex items-start gap-3 rounded-lg border p-3"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={MEMORY_KIND_BADGE[memory.kind]}>
            {MEMORY_KIND_LABELS[memory.kind]}
          </Badge>
          {memory.status === 'archived' && <Badge variant="outline">已归档</Badge>}
          <span className="text-xs text-muted-foreground">
            重要性 {memory.importance.toFixed(1)} · 更新于 {formatMemoryDate(memory.updatedAt)}
          </span>
        </div>
        <p className="break-words text-sm">{memory.content}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          编辑
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="memory-delete"
          disabled={deleting}
          onClick={onDelete}
        >
          删除
        </Button>
      </div>
    </div>
  );
}

/** 设置页：长期记忆库管理（搜索/筛选/增改删/清空） */
export function MemoryPanel() {
  const [search, setSearch] = React.useState('');
  const [kind, setKind] = React.useState<'' | MemoryKind>('');
  const [status, setStatus] = React.useState<StatusFilter>('');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Memory | null>(null);

  const filter = {
    limit: 200,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(kind ? { kind } : {}),
    ...(status ? { status } : {}),
  };
  const { data: memories, isLoading, isError, refetch } = useMemories(filter);
  const mutations = useMemoryMutations();
  const toast = useToast();

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (memory: Memory) => {
    setEditing(memory);
    setDialogOpen(true);
  };

  const remove = async (memory: Memory) => {
    if (!window.confirm(`确定删除这条记忆吗？\n\n${memory.content}`)) return;
    try {
      await mutations.remove.mutateAsync(memory.id);
      toast.success('记忆已删除');
    } catch {
      toast.error('删除失败');
    }
  };

  const clearAll = async () => {
    if (!window.confirm('确定清空全部记忆吗？此操作不可恢复，所有记忆及其向量都会被删除。')) return;
    try {
      const result = await mutations.clear.mutateAsync();
      toast.success(`已清空 ${result.removed} 条记忆`);
    } catch {
      toast.error('清空失败');
    }
  };

  return (
    <section className="space-y-3 rounded-xl border p-4" data-testid="memory-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">长期记忆</h2>
          <p className="text-sm text-muted-foreground">
            对话中自动提取的用户事实、偏好与事件，用于跨会话召回。
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={openCreate}>
            添加记忆
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="memory-clear"
            disabled={!memories?.length}
            onClick={() => void clearAll()}
          >
            全部清空
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="搜索记忆"
          placeholder="搜索记忆内容…"
          value={search}
          className="h-9 max-w-xs"
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          aria-label="按类别筛选"
          className="h-9 w-28"
          value={kind}
          onChange={(e) => setKind(e.target.value as '' | MemoryKind)}
        >
          <option value="">全部类别</option>
          {MEMORY_KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="按状态筛选"
          className="h-9 w-28"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="">全部状态</option>
          <option value="active">活跃</option>
          <option value="archived">已归档</option>
        </Select>
      </div>

      {isLoading && <Spinner />}
      {isError && <ErrorState message="记忆加载失败" onRetry={() => void refetch()} />}
      {!isLoading && !isError && memories && (
        <div className="space-y-2" data-testid="memory-list">
          {memories.length === 0 ? (
            <EmptyState
              title="还没有记忆"
              description="开启助手的长期记忆后，值得记住的信息会在对话结束后自动出现在这里。"
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
