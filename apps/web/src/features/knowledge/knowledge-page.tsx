'use client';

import * as React from 'react';
import type { KnowledgeBase } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { ApiClientError } from '@/lib/api/client';
import { useDocuments, useKnowledgeBases, useKnowledgeMutations } from '@/lib/hooks/use-knowledge';
import { useI18n } from '@/lib/i18n/use-i18n';
import { KnowledgeBaseFormDialog } from './kb-form-dialog';
import { UploadDropzone } from './upload-dropzone';
import { ClipDialog } from './clip-dialog';
import { DocumentList } from './document-list';
import { GovernancePanel } from './governance-panel';
import { CompileToolbar } from './compile-toolbar';

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
  const { t } = useI18n();
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-muted/30" data-testid="kb-sidebar">
      <div className="p-3">
        <Button type="button" className="w-full" size="sm" onClick={onCreate}>
          {t('knowledge.createKb')}
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
                aria-label={t('knowledge.editAria', { name: kb.name })}
                onClick={() => onEdit(kb)}
              >
                {t('knowledge.editShort')}
              </button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-destructive"
                aria-label={t('knowledge.deleteAria', { name: kb.name })}
                onClick={() => onDelete(kb)}
              >
                {t('knowledge.deleteShort')}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function KnowledgePage() {
  const { t } = useI18n();
  const { data: knowledgeBases, isLoading, isError, refetch } = useKnowledgeBases();
  const mutations = useKnowledgeMutations();
  const toast = useToast();
  const confirm = useConfirm();
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
    if (
      !(await confirm({
        title: t('knowledge.deleteTitle'),
        description: t('knowledge.deleteConfirm', { name: kb.name }),
        confirmText: t('common.actions.delete'),
        danger: true,
      }))
    ) {
      return;
    }
    try {
      await mutations.remove.mutateAsync(kb.id);
      if (activeId === kb.id) setActiveId(null);
      toast.success(t('knowledge.deleted'));
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t('knowledge.deleteFailed'));
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
          <ErrorState message={t('knowledge.loadError')} onRetry={() => void refetch()} />
        ) : !activeKb ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState
              title={t('knowledge.empty.title')}
              description={t('knowledge.empty.description')}
              action={<Button onClick={openCreate}>{t('knowledge.empty.action')}</Button>}
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
                {t('knowledge.importFromWeb')}
              </Button>
            </div>
            <UploadDropzone kbId={activeKb.id} />
            <CompileToolbar kbId={activeKb.id} documents={docs.data} />
            <DocumentList kbId={activeKb.id} documents={docs.data} loading={docs.isLoading} />
            <GovernancePanel kbId={activeKb.id} />
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
