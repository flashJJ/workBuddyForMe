'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { ConversationBranch } from '@wbfm/shared/types';
import { EmptyState, Spinner } from '@/components/common/state';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useBranches, useBranchActions, type BranchCreatePayload } from '../hooks/use-branches';
import { BranchBudgetBar } from './branch-budget';
import { BranchCard } from './branch-card';
import { BranchCreateForm } from './branch-create-form';

interface Props {
  conversationId: string;
  onClose?: () => void;
}

/** v2.21：分支面板：预算 + 派生 + 列表（活跃/归档） */
export function BranchPanel({ conversationId, onClose }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const { branches, budget, isLoading, isError, refetch } = useBranches(conversationId, true);
  const actions = useBranchActions(conversationId);
  const [creating, setCreating] = React.useState(false);

  const openChild = (childId: string): void => {
    router.push(`/chat?conversation=${encodeURIComponent(childId)}`);
  };

  const rename = (branch: ConversationBranch): void => {
    const title = window.prompt(t('branch.list.renamePrompt', { title: branch.title }), branch.title);
    const trimmed = title?.trim();
    if (trimmed && trimmed !== branch.title) {
      actions.rename.mutate({ branchId: branch.id, title: trimmed });
    }
  };

  const remove = (branch: ConversationBranch): void => {
    const message =
      branch.status === 'running' || branch.status === 'waiting'
        ? t('branch.confirm.removeRunningDescription', { title: branch.title })
        : t('branch.confirm.removeDescription', { title: branch.title });
    if (window.confirm(`${t('branch.confirm.removeTitle')}\n\n${message}`)) {
      actions.remove.mutate(branch.id);
    }
  };

  const submit = (payload: BranchCreatePayload): void => {
    actions.create.mutate(payload, { onSuccess: () => setCreating(false) });
  };

  const cardActions = {
    onStart: (id: string) => actions.start.mutate(id),
    onRename: rename,
    onCancel: (id: string) => actions.cancel.mutate(id),
    onArchive: (id: string) => actions.archive.mutate(id),
    onRestore: (id: string) => actions.restore.mutate(id),
    onRemove: remove,
    onOpenChild: openChild,
  };
  const active = branches.filter((branch) => !branch.archivedAt);
  const archived = branches.filter((branch) => branch.archivedAt);
  const createError = actions.create.error as { message?: string } | null;
  const startError = actions.start.error as { message?: string } | null;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3" data-testid="branch-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t('branch.title')}</h2>
        {onClose && (
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            {t('branch.close')}
          </Button>
        )}
      </div>

      <BranchBudgetBar budget={budget} />

      {startError?.message && (
        <p className="text-xs text-destructive break-words" data-testid="branch-start-error">
          {startError.message}
        </p>
      )}

      {creating ? (
        <BranchCreateForm
          busy={actions.create.isPending}
          error={createError?.message ?? null}
          onSubmit={submit}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <Button type="button" size="sm" onClick={() => setCreating(true)} data-testid="branch-create-open">
          {t('branch.create.title')}
        </Button>
      )}

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <EmptyState title={t('branch.create.failed')} action={<Button size="sm" onClick={() => refetch()}>Retry</Button>} />
      ) : branches.length === 0 ? (
        <EmptyState title={t('branch.empty')} />
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            {active.map((branch) => (
              <BranchCard key={branch.id} branch={branch} actions={cardActions} />
            ))}
          </div>
          {archived.length > 0 && (
            <details className="space-y-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                {t('branch.list.archived')} ({archived.length})
              </summary>
              <div className="mt-2 space-y-2">
                {archived.map((branch) => (
                  <BranchCard key={branch.id} branch={branch} actions={cardActions} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
