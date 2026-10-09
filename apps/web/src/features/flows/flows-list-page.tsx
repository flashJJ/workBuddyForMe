'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { History, Pencil, Plus, Trash2, Workflow } from 'lucide-react';
import type { FlowStatus, WorkflowView } from '@wbfm/shared/types';
import type { WorkflowCreateInput } from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useFlowMutations, useFlows } from '@/lib/hooks/use-flows';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useIntl } from '@/lib/i18n/use-intl';
import { errorText } from '@/lib/i18n/resolve-error';
import { FlowFormDialog } from './flow-form-dialog';

const STATUS_META: Record<FlowStatus, { labelKey: MessageKey; variant: 'outline' | 'success' | 'default' }> = {
  draft: { labelKey: 'flows.status.draft', variant: 'outline' },
  published: { labelKey: 'flows.status.published', variant: 'success' },
  disabled: { labelKey: 'flows.status.disabled', variant: 'outline' },
};

export function FlowsListPage() {
  const { t } = useI18n();
  const router = useRouter();
  const flowsQuery = useFlows();
  const mutations = useFlowMutations();
  const toast = useToast();
  const confirm = useConfirm();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<WorkflowView | null>(null);

  const errToast = (e: unknown, fallback: MessageKey) =>
    toast.error(errorText(e, t, { fallback }));

  const create = async (body: WorkflowCreateInput) => {
    try {
      const wf = await mutations.create.mutateAsync(body);
      setCreateOpen(false);
      router.push(`/flows/${wf.id}`);
    } catch (e) {
      errToast(e, 'flows.createFailed');
    }
  };

  const update = async (body: WorkflowCreateInput) => {
    if (!editing) return;
    try {
      await mutations.update.mutateAsync({ id: editing.id, body });
      setEditing(null);
      toast.success(t('flows.updated'));
    } catch (e) {
      errToast(e, 'flows.updateFailed');
    }
  };

  const remove = async (wf: WorkflowView) => {
    if (
      !(await confirm({
        title: t('flows.deleteTitle'),
        description: t('flows.deleteConfirm', { name: wf.name }),
        confirmText: t('common.actions.delete'),
        danger: true,
      }))
    ) {
      return;
    }
    void mutations.remove.mutate(wf.id);
  };

  const flows = flowsQuery.data ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b bg-card px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">{t('flows.title')}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('flows.description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/flows/runs">
            <Button variant="outline">
              <History className="h-4 w-4" />
              {t('flows.runsLink')}
            </Button>
          </Link>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {t('flows.create')}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {flowsQuery.isLoading ? (
          <Spinner label={t('flows.loading')} />
        ) : flowsQuery.isError ? (
          <ErrorState message={t('flows.loadError')} onRetry={() => flowsQuery.refetch()} />
        ) : flows.length === 0 ? (
          <EmptyState
            icon={<Workflow className="h-8 w-8" />}
            title={t('flows.empty.title')}
            description={t('flows.empty.description')}
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                {t('flows.create')}
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
        title={t('flows.createFormTitle')}
        onSubmit={create}
        onClose={() => setCreateOpen(false)}
      />
      <FlowFormDialog
        open={editing !== null}
        title={t('flows.editFormTitle')}
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
  const { t } = useI18n();
  const intl = useIntl();
  const badge = STATUS_META[wf.status];
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
              {wf.description || t('flows.noDescription')}
            </p>
          </div>
          <Badge variant={badge.variant}>{t(badge.labelKey)}</Badge>
        </div>
        <div className="mt-3 flex items-center text-[11px] text-muted-foreground">
          <span>v{wf.currentVersion}</span>
          <span className="mx-2">·</span>
          <span>
            {wf.lastRunAt
              ? t('flows.lastRun', { date: intl.formatCompactDateTime(wf.lastRunAt) })
              : t('flows.noRuns')}
          </span>
          <div className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onEdit}
              title={t('flows.editInfoTitle')}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              title={t('common.actions.delete')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </li>
  );
}


