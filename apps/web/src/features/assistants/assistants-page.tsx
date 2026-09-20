'use client';

import * as React from 'react';
import type { Assistant } from '@wbfm/shared';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { useAssistants, useAssistantMutations } from '@/lib/hooks/use-assistants';
import { useAllModels } from '@/lib/hooks/use-settings';
import { useKnowledgeBases } from '@/lib/hooks/use-knowledge';
import { AssistantCard } from './assistant-card';
import { AssistantFormDialog } from './assistant-form-dialog';

export function AssistantsPage() {
  const { data: assistants, isLoading, isError, refetch } = useAssistants();
  const { data: models } = useAllModels();
  const { data: knowledgeBases } = useKnowledgeBases();
  const mutations = useAssistantMutations();
  const toast = useToast();
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
    if (!window.confirm(`确定删除助手「${assistant.name}」？相关对话记录不会被删除。`)) return;
    try {
      await mutations.remove.mutateAsync(assistant.id);
      toast.success('助手已删除');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '删除失败');
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
      toast.error(error instanceof ApiClientError ? error.message : '排序失败');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="助手"
        description="为不同场景定制人设与参数，可绑定专属模型和知识库。"
        actions={
          <Button type="button" onClick={openCreate}>
            新建助手
          </Button>
        }
      />
      <div className="px-6">
        {isLoading && <Spinner />}
        {isError && <ErrorState message="助手加载失败" onRetry={() => void refetch()} />}
        {!isLoading && !isError && assistants && (
          <div className="grid gap-4 pb-8 sm:grid-cols-2 xl:grid-cols-3" data-testid="assistant-grid">
            {assistants.length === 0 && (
              <EmptyState
                title="还没有自定义助手"
                description="新建一个助手，为它设定人设和默认参数。"
                action={<Button onClick={openCreate}>去新建</Button>}
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
