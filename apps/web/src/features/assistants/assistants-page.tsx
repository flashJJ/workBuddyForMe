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
import { useSkills } from '@/lib/hooks/use-skills';
import { useI18n } from '@/lib/i18n/use-i18n';
import { AssistantCard } from './assistant-card';
import { AssistantFormDialog } from './assistant-form-dialog';
import { AssistantsTemplateEmptyGallery, AssistantsTemplateSection } from './assistant-templates';
import type { AssistantPreset } from './assistant-form-state';
import { ASSISTANT_PRESET_BINDINGS } from '@/lib/templates/starter-templates';
import type { TemplateGalleryItem } from '@/components/common/template-gallery';

export function AssistantsPage() {
  const { t } = useI18n();
  const { data: assistants, isLoading, isError, refetch } = useAssistants();
  const { data: models } = useAllModels();
  const { data: knowledgeBases } = useKnowledgeBases();
  const { data: skills } = useSkills();
  const mutations = useAssistantMutations();
  const toast = useToast();
  const confirm = useConfirm();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Assistant | null>(null);
  const [preset, setPreset] = React.useState<AssistantPreset | null>(null);

  const openCreate = () => {
    setEditing(null);
    setPreset(null);
    setDialogOpen(true);
  };

  const openEdit = (assistant: Assistant) => {
    setEditing(assistant);
    setPreset(null);
    setDialogOpen(true);
  };

  /** 模板「以此开始」= 预填新建表单（M0 D5） */
  const openPreset = (item: TemplateGalleryItem) => {
    const binding = ASSISTANT_PRESET_BINDINGS[item.id];
    setEditing(null);
    setPreset({
      name: item.name,
      cardId: binding?.cardId ?? null,
      knowledgeBaseIds: binding?.knowledgeBaseId ? [binding.knowledgeBaseId] : [],
      // v2.4 M4（P1-2）：预设绑定的技能随表单预勾选（空=跟随全局）
      skillNames: binding?.skillNames ?? [],
    });
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
          <div className="pb-8">
            {assistants.length > 0 && (
              <div className="mb-4">
                <AssistantsTemplateSection onPick={openPreset} />
              </div>
            )}
            {assistants.length === 0 && (
              <div className="flex flex-col items-center">
                <EmptyState
                  title={t('assistants.empty.title')}
                  description={t('assistants.empty.description')}
                  action={<Button onClick={openCreate}>{t('assistants.empty.action')}</Button>}
                />
                <div className="mt-4 w-full max-w-3xl">
                  <AssistantsTemplateEmptyGallery onPick={openPreset} />
                </div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="assistant-grid">
              {assistants.map((assistant, index) => (
                <AssistantCard
                  key={assistant.id}
                  assistant={assistant}
                  models={models ?? []}
                  knowledgeBases={knowledgeBases ?? []}
                  skills={skills ?? []}
                  canMoveUp={index > 0}
                  canMoveDown={index < assistants.length - 1}
                  onEdit={openEdit}
                  onDelete={(item) => void remove(item)}
                  onMove={(item, direction) => void move(item, direction)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <AssistantFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        assistant={editing}
        preset={preset}
      />
    </div>
  );
}
