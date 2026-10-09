'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { History, Pencil, Plus, Trash2, Workflow } from 'lucide-react';
import type { FlowStatus, WorkflowView } from '@wbfm/shared/types';
import type { WorkflowCreateInput } from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { useFlowMutations, useFlows } from '@/lib/hooks/use-flows';
import { FlowFormDialog } from './flow-form-dialog';

const STATUS_LABEL: Record<FlowStatus, { text: string; variant: 'outline' | 'success' | 'default' }> = {
  draft: { text: '草稿', variant: 'outline' },
  published: { text: '已发布', variant: 'success' },
  disabled: { text: '已停用', variant: 'outline' },
};

export function FlowsListPage() {
  const router = useRouter();
  const flowsQuery = useFlows();
  const mutations = useFlowMutations();
  const toast = useToast();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<WorkflowView | null>(null);

  const errToast = (e: unknown, fallback: string) =>
    toast.error(e instanceof ApiClientError ? e.message : fallback);

  const create = async (body: WorkflowCreateInput) => {
    try {
      const wf = await mutations.create.mutateAsync(body);
      setCreateOpen(false);
      router.push(`/flows/${wf.id}`);
    } catch (e) {
      errToast(e, '创建失败');
    }
  };

  const update = async (body: WorkflowCreateInput) => {
    if (!editing) return;
    try {
      await mutations.update.mutateAsync({ id: editing.id, body });
      setEditing(null);
      toast.success('已更新');
    } catch (e) {
      errToast(e, '更新失败');
    }
  };

  const remove = (wf: WorkflowView) => {
    if (!window.confirm(`删除工作流「${wf.name}」？其全部版本与运行记录将被清除。`)) return;
    void mutations.remove.mutate(wf.id);
  };

  const flows = flowsQuery.data ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b bg-card px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">工作流</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            把检索、判断、生成、工具、人工审核画成确定的流程图；发布后可在对话中作为工具调用。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/flows/runs">
            <Button variant="outline">
              <History className="h-4 w-4" />
              运行记录
            </Button>
          </Link>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            新建工作流
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {flowsQuery.isLoading ? (
          <Spinner label="加载工作流..." />
        ) : flowsQuery.isError ? (
          <ErrorState message="工作流加载失败" onRetry={() => flowsQuery.refetch()} />
        ) : flows.length === 0 ? (
          <EmptyState
            icon={<Workflow className="h-8 w-8" />}
            title="还没有工作流"
            description="新建一个，在画布上拖入节点、连线、试运行调试。"
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                新建工作流
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {flows.map((wf) => (
              <FlowCard key={wf.id} wf={wf} onEdit={() => setEditing(wf)} onDelete={() => remove(wf)} />
            ))}
          </ul>
        )}
      </div>

      <FlowFormDialog
        open={createOpen}
        title="新建工作流"
        onSubmit={create}
        onClose={() => setCreateOpen(false)}
      />
      <FlowFormDialog
        open={editing !== null}
        title="编辑工作流信息"
        initial={editing ?? undefined}
        onSubmit={update}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function FlowCard({
  wf,
  onEdit,
  onDelete,
}: {
  wf: WorkflowView;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const badge = STATUS_LABEL[wf.status];
  return (
    <li>
      <Card className="group p-4 transition-shadow hover:shadow-md">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Workflow className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <Link href={`/flows/${wf.id}`} className="block">
              <p className="truncate text-sm font-medium hover:text-primary">{wf.name}</p>
            </Link>
            <p className="mt-0.5 line-clamp-2 h-8 text-xs leading-4 text-muted-foreground">
              {wf.description || '暂无描述'}
            </p>
          </div>
          <Badge variant={badge.variant}>{badge.text}</Badge>
        </div>
        <div className="mt-3 flex items-center text-[11px] text-muted-foreground">
          <span>v{wf.currentVersion}</span>
          <span className="mx-2">·</span>
          <span>{wf.lastRunAt ? `上次运行 ${formatTime(wf.lastRunAt)}` : '尚无运行记录'}</span>
          <div className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title="编辑信息">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              title="删除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </li>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
