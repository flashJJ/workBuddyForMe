'use client';

import * as React from 'react';
import type { KnowledgeBase } from '@wbfm/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { useDocuments, useKnowledgeBases, useKnowledgeMutations } from '@/lib/hooks/use-knowledge';
import { KnowledgeBaseFormDialog } from './kb-form-dialog';
import { UploadDropzone } from './upload-dropzone';
import { ClipDialog } from './clip-dialog';
import { DocumentList } from './document-list';

function KnowledgeBaseNav({
  knowledgeBases,
  activeId,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
}: {
  knowledgeBases: KnowledgeBase[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onEdit: (kb: KnowledgeBase) => void;
  onDelete: (kb: KnowledgeBase) => void;
}) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-muted/30" data-testid="kb-sidebar">
      <div className="p-3">
        <Button type="button" className="w-full" size="sm" onClick={onCreate}>
          + 新建知识库
        </Button>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {knowledgeBases.map((kb) => (
          <li
            key={kb.id}
            className={`group flex items-center rounded-md px-2 py-1.5 text-sm ${
              kb.id === activeId ? 'bg-accent' : 'hover:bg-accent/50'
            }`}
          >
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left"
              onClick={() => onSelect(kb.id)}
              aria-current={kb.id === activeId ? 'true' : undefined}
              title={kb.description || kb.name}
            >
              {kb.name}
              <Badge variant="outline" className="ml-2">
                {kb.documentCount}
              </Badge>
            </button>
            <span className="ml-1 hidden shrink-0 gap-1 group-hover:flex">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                aria-label={`编辑 ${kb.name}`}
                onClick={() => onEdit(kb)}
              >
                改
              </button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-red-500"
                aria-label={`删除 ${kb.name}`}
                onClick={() => onDelete(kb)}
              >
                删
              </button>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function KnowledgePage() {
  const { data: knowledgeBases, isLoading, isError, refetch } = useKnowledgeBases();
  const mutations = useKnowledgeMutations();
  const toast = useToast();
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [clipOpen, setClipOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<KnowledgeBase | null>(null);

  React.useEffect(() => {
    if (!knowledgeBases) return;
    if (!activeId || !knowledgeBases.some((kb) => kb.id === activeId)) {
      setActiveId(knowledgeBases[0]?.id ?? null);
    }
  }, [knowledgeBases, activeId]);

  const activeKb = knowledgeBases?.find((kb) => kb.id === activeId) ?? null;
  const docs = useDocuments(activeId);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const removeKb = async (kb: KnowledgeBase) => {
    if (!window.confirm(`删除知识库「${kb.name}」？其中全部文档与向量索引将被清除。`)) return;
    try {
      await mutations.remove.mutateAsync(kb.id);
      if (activeId === kb.id) setActiveId(null);
      toast.success('知识库已删除');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '删除失败');
    }
  };

  return (
    <div className="flex h-full" data-testid="knowledge-page">
      {isLoading ? (
        <Spinner />
      ) : (
        <KnowledgeBaseNav
          knowledgeBases={knowledgeBases ?? []}
          activeId={activeId}
          onSelect={setActiveId}
          onCreate={openCreate}
          onEdit={(kb) => {
            setEditing(kb);
            setDialogOpen(true);
          }}
          onDelete={(kb) => void removeKb(kb)}
        />
      )}

      <main className="min-w-0 flex-1 overflow-y-auto">
        {isError ? (
          <ErrorState message="知识库加载失败" onRetry={() => void refetch()} />
        ) : !activeKb ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState
              title="还没有知识库"
              description="新建知识库并上传文档，助手即可基于你的资料回答问题。"
              action={<Button onClick={openCreate}>去新建</Button>}
            />
          </div>
        ) : (
          <div className="space-y-5 p-6">
            <div className="flex items-center justify-between gap-3">
              <PageHeader title={activeKb.name} description={activeKb.description || undefined} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="open-clip-dialog"
                onClick={() => setClipOpen(true)}
              >
                从网页导入
              </Button>
            </div>
            <UploadDropzone kbId={activeKb.id} />
            <DocumentList kbId={activeKb.id} documents={docs.data} loading={docs.isLoading} />
          </div>
        )}
      </main>

      <KnowledgeBaseFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        knowledgeBase={editing}
      />
      {activeKb && (
        <ClipDialog kbId={activeKb.id} open={clipOpen} onOpenChange={setClipOpen} />
      )}
    </div>
  );
}
