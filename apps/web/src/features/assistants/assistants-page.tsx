'use client';

import * as React from 'react';
import type { Assistant } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { errorText } from '@/lib/i18n/resolve-error';
import { useAssistants, useAssistantMutations } from '@/lib/hooks/use-assistants';
import { useAllModels } from '@/lib/hooks/use-settings';
import { useKnowledgeBases } from '@/lib/hooks/use-knowledge';
import { useI18n } from '@/lib/i18n/use-i18n';
import { AssistantCard } from './assistant-card';
import { AssistantFormDialog } from './assistant-form-dialog';

export function AssistantsPage() {
  const { t } = useI18n();
  const { data: assistants, isLoading, isError, refetch } = useAssistants();
  const { data: models } = useAllModels();
  const { data: knowledgeBases } = useKnowledgeBases();
  const mutations = useAssistantMutations();
  const toast = useToast();
  const confirm = useConfirm();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Assistant | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (assistant: Assistant) => {
    setEditing(assistant);
    setDialogOpen(true);
  };

  const remove = async (assistant: Assistant) => {
    if (
      !(await confirm({
        title: t('assistants.deleteTitle'),
        description: t('assistants.deleteConfirm', { name: assistant.name }),
        confirmText: t('common.actions.delete'),
        danger: true,
      }))
    ) {
      return;
    }
    try {
      await mutations.remove.mutateAsync(assistant.id);
      toast.success(t('assistants.deleted'));
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'assistants.deleteFailed' }));
    }
  };

  const move = async (assistant: Assistant, direction: -1 | 1) => {
    if (!assistants) return;
    const index = assistants.findIndex((item) => item.id === assistant.id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= assistants.length) return;
    const ordered = [...assistants];
    [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
    try {
      await mutations.reorder.mutateAsync(ordered.map((item) => item.id));
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'assistants.reorderFailed' }));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('assistants.title')}
        description={t('assistants.description')}
        actions={
          <Button type="button" onClick={openCreate}>
            {t('assistants.create')}
          </Button>
        }
      />
      <div className="px-6">
        {isLoading && <Spinner />}
        {isError && <ErrorState message={t('assistants.loadError')} onRetry={() => void refetch()} />}
        {!isLoading && !isError && assistants && (
          <div className="grid gap-4 pb-8 sm:grid-cols-2 xl:grid-cols-3" data-testid="assistant-grid">
            {assistants.length === 0 && (
              <EmptyState
                title={t('assistants.empty.title')}
                description={t('assistants.empty.description')}
                action={<Button onClick={openCreate}>{t('assistants.empty.action')}</Button>}
              />
            )}
            {assistants.map((assistant, index) => (
              <AssistantCard
                key={assistant.id}
                assistant={assistant}
                models={models ?? []}
                knowledgeBases={knowledgeBases ?? []}
                canMoveUp={index > 0}
                canMoveDown={index < assistants.length - 1}
                onEdit={openEdit}
                onDelete={(item) => void remove(item)}
                onMove={(item, direction) => void move(item, direction)}
              />
            ))}
          </div>
        )}
      </div>

      <AssistantFormDialog open={dialogOpen} onOpenChange={setDialogOpen} assistant={editing} />
    </div>
  );
}
