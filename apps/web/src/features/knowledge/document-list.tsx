'use client';

import type { DocumentRecord, DocumentStatus } from '@wbfm/shared';
import { Badge } from '@/components/ui/badge';
import { EmptyState, Spinner } from '@/components/common/state';
import { useKnowledgeMutations } from '@/lib/hooks/use-knowledge';

const STATUS_VARIANT: Record<DocumentStatus, 'default' | 'success' | 'warning' | 'danger' | 'outline'> = {
  pending: 'outline',
  processing: 'warning',
  indexed: 'success',
  failed: 'danger',
};

const STATUS_LABEL: Record<DocumentStatus, string> = {
  pending: '等待中',
  processing: '索引中',
  indexed: '已索引',
  failed: '失败',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function DocumentList({ kbId, documents, loading }: {
  kbId: string;
  documents: DocumentRecord[] | undefined;
  loading: boolean;
}) {
  const mutations = useKnowledgeMutations();

  const remove = (document: DocumentRecord) => {
    if (!window.confirm(`删除文档「${document.filename}」及其向量索引？`)) return;
    void mutations.deleteDocument.mutateAsync({ kbId, documentId: document.id });
  };

  if (loading) return <Spinner />;
  if (!documents || documents.length === 0) {
    return <EmptyState title="还没有文档" description="上传文档后会自动分片、向量化并可用于对话引用。" />;
  }

  return (
    <ul className="divide-y rounded-lg border" data-testid="document-list">
      {documents.map((document) => (
        <li key={document.id} className="flex items-center gap-3 px-4 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate font-medium" title={document.filename}>
              {document.source === 'webpage' && (
                <Badge variant="outline" className="shrink-0 text-[10px]" data-testid="webpage-badge">
                  网页
                </Badge>
              )}
              <span className="truncate">{document.filename}</span>
            </p>
            <p className="truncate text-xs text-muted-foreground" title={document.sourceUrl ?? undefined}>
              {formatSize(document.byteSize)} · {document.chunkCount > 0 ? `${document.chunkCount} 个分片` : '尚未分片'}
              {document.sourceUrl ? ` · ${document.sourceUrl}` : ''}
            </p>
          </div>
          {document.sourceUrl && (
            <a
              href={document.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs text-primary hover:underline"
              data-testid="webpage-source-link"
            >
              原文
            </a>
          )}
          <Badge
            variant={STATUS_VARIANT[document.status]}
            title={document.status === 'failed' ? document.errorMessage ?? '索引失败' : undefined}
          >
            {STATUS_LABEL[document.status]}
          </Badge>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-red-500"
            aria-label={`删除文档 ${document.filename}`}
            onClick={() => remove(document)}
          >
            删除
          </button>
        </li>
      ))}
    </ul>
  );
}
