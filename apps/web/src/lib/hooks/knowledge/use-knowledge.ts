'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useVisibleQuery } from '@/lib/ui/panel-visibility';
import type { ConflictItem, DuplicatePair } from '@wbfm/core/knowledge';
import type { DocumentStructureView } from '@wbfm/core/services';
import type {
  ContentPackImportResult,
  ContentPackSummary,
  DocumentComparisonResult,
  DocumentRecord,
  KnowledgeBase,
} from '@wbfm/shared/types';
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

export interface KnowledgeBaseBody {
  name: string;
  description?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}

export function useKnowledgeBases() {
  return useVisibleQuery({
    queryKey: QUERY_KEYS.knowledgeBases,
    queryFn: () => apiGet<KnowledgeBase[]>(API.knowledgeBases),
  });
}

/** v2.18 M4：示例内容包清单（含已导入状态） */
export function useContentPacks() {
  return useVisibleQuery({
    queryKey: QUERY_KEYS.contentPacks,
    queryFn: () => apiGet<ContentPackSummary[]>(API.contentPacks),
  });
}

export function useDocuments(kbId: string | null) {
  return useVisibleQuery({
    queryKey: QUERY_KEYS.documents(kbId ?? '_'),
    queryFn: () => apiGet<DocumentRecord[]>(API.documents(kbId!)),
    enabled: Boolean(kbId),
    refetchInterval: (query) =>
      query.state.data?.some((doc) => doc.status === 'pending' || doc.status === 'processing')
        ? 1500
        : false,
  });
}

/** v2.19：文档结构预览（页/章节/表格/警告），随文档重建重新拉取 */
export function useDocumentStructure(documentId: string | null, enabled = true) {
  return useVisibleQuery({
    queryKey: QUERY_KEYS.documentStructure(documentId ?? '_'),
    queryFn: () => apiGet<DocumentStructureView>(API.documentStructure(documentId!)),
    enabled: Boolean(documentId) && enabled,
  });
}

export interface DocumentComparisonInput {
  leftDocumentId: string;
  rightDocumentId: string;
  format: 'md' | 'html';
  locale: 'zh' | 'en';
}

/** v2.19：跨文档对比产物（生成即返回产物引用与统计） */
export function useDocumentComparison() {
  return useMutation({
    mutationFn: (input: DocumentComparisonInput) =>
      apiPost<DocumentComparisonResult>(API.documentCompare, input),
  });
}

/** v1.3 M3：知识冲突待裁决 + 疑似重复文档建议（只读，按需启用） */
export function useKnowledgeGovernance(kbId: string | null) {
  const conflicts = useVisibleQuery({
    queryKey: [...QUERY_KEYS.kbGovernance(kbId ?? '_'), 'conflicts'],
    queryFn: () => apiGet<{ conflicts: ConflictItem[] }>(API.kbConflicts(kbId!)),
    enabled: Boolean(kbId),
  });
  const duplicates = useVisibleQuery({
    queryKey: [...QUERY_KEYS.kbGovernance(kbId ?? '_'), 'duplicates'],
    queryFn: () => apiGet<{ duplicates: DuplicatePair[] }>(API.kbDuplicates(kbId!)),
    enabled: Boolean(kbId),
  });
  return { conflicts, duplicates };
}

/** v1.3 M4：编译状态总览（counts=DB 真源；progress=队列内存态，可能为 null） */
export interface CompileStatusSnapshot {
  counts: {
    queued: number;
    running: number;
    ready: number;
    failed: number;
    skipped: number;
  };
  progress: {
    kbId: string;
    running: boolean;
    currentDocumentId: string | null;
    done: number;
    failed: number;
    total: number;
  } | null;
}

/** 编译状态查询：运行/排队中 2s 轮询兜底（主通道为 SSE） */
export function useCompileStatus(kbId: string | null) {
  return useVisibleQuery({
    queryKey: QUERY_KEYS.kbCompileStatus(kbId ?? '_'),
    queryFn: () => apiGet<CompileStatusSnapshot>(API.kbCompileStatus(kbId!)),
    enabled: Boolean(kbId),
    refetchInterval: (query) => {
      const counts = query.state.data?.counts;
      return counts && (counts.queued > 0 || counts.running > 0) ? 2000 : false;
    },
  });
}

/** 编译进度 SSE：任一事件到达即失效状态与文档查询（EventSource 断线自动重连） */
export function useCompileEvents(kbId: string | null) {
  const qc = useQueryClient();
  React.useEffect(() => {
    if (!kbId) return;
    const token = (globalThis as { window?: { wbfm?: { token?: string } } }).window?.wbfm?.token;
    const url = `${API.kbCompileEvents(kbId)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const es = new EventSource(url);
    const invalidate = () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.kbCompileStatus(kbId) });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.documents(kbId) });
    };
    es.addEventListener('compile', invalidate);
    return () => {
      es.close();
    };
  }, [kbId, qc]);
}

export function useKnowledgeMutations() {
  const qc = useQueryClient();
  const invalidateKb = () => qc.invalidateQueries({ queryKey: QUERY_KEYS.knowledgeBases });

  return {
    create: useMutation({
      mutationFn: (body: KnowledgeBaseBody) => apiPost<KnowledgeBase>(API.knowledgeBases, body),
      onSuccess: invalidateKb,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Partial<KnowledgeBaseBody> }) =>
        apiPatch<KnowledgeBase>(API.knowledgeBase(id), body),
      onSuccess: invalidateKb,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiDelete<{ id: string }>(API.knowledgeBase(id)),
      onSuccess: invalidateKb,
    }),
    uploadDocument: useMutation({
      mutationFn: ({ kbId, file }: { kbId: string; file: File }) => {
        const form = new FormData();
        form.append('file', file);
        return apiUpload<DocumentRecord>(API.documents(kbId), form);
      },
      onSuccess: (_data, variables) =>
        qc.invalidateQueries({ queryKey: QUERY_KEYS.documents(variables.kbId) }),
    }),
    /** v2.18 M4：导入内容包（建库 + 注册文档；索引在后台继续） */
    importContentPack: useMutation({
      mutationFn: (id: string) =>
        apiPost<ContentPackImportResult>(API.contentPackImport, { id }),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: QUERY_KEYS.contentPacks });
        void qc.invalidateQueries({ queryKey: QUERY_KEYS.knowledgeBases });
      },
    }),
    clipDocument: useMutation({
      mutationFn: ({ kbId, url }: { kbId: string; url: string }) =>
        apiPost<DocumentRecord>(API.clip(kbId), { url }),
      onSuccess: (_data, variables) =>
        qc.invalidateQueries({ queryKey: QUERY_KEYS.documents(variables.kbId) }),
    }),
    deleteDocument: useMutation({
      mutationFn: (input: { kbId: string; documentId: string }) =>
        apiDelete<{ id: string }>(API.document(input.documentId)),
      onSuccess: (_data, variables) =>
        qc.invalidateQueries({ queryKey: QUERY_KEYS.documents(variables.kbId) }),
    }),
    /** v2.19：手动重建结构/分块/索引 */
    reparseDocument: useMutation({
      mutationFn: (input: { kbId: string; documentId: string }) =>
        apiPost<{ queued: true }>(API.documentReparse(input.documentId), {}),
      onSuccess: (_data, variables) => {
        void qc.invalidateQueries({ queryKey: QUERY_KEYS.documents(variables.kbId) });
        void qc.invalidateQueries({
          queryKey: QUERY_KEYS.documentStructure(variables.documentId),
        });
      },
    }),
    /** v1.3 M4：触发编译（入队即返回） */
    compile: useMutation({
      mutationFn: (input: { kbId: string; scope: 'new' | 'all' }) =>
        apiPost<{ queued: number; skipped: number }>(API.kbCompile(input.kbId), {
          scope: input.scope,
        }),
      onSuccess: (_data, variables) => {
        void qc.invalidateQueries({ queryKey: QUERY_KEYS.kbCompileStatus(variables.kbId) });
        void qc.invalidateQueries({ queryKey: QUERY_KEYS.documents(variables.kbId) });
      },
    }),
    compileCancel: useMutation({
      mutationFn: (kbId: string) =>
        apiPost<{ dropped: number; aborted: boolean }>(API.kbCompileCancel(kbId), {}),
      onSuccess: (_data, kbId) => {
        void qc.invalidateQueries({ queryKey: QUERY_KEYS.kbCompileStatus(kbId) });
        void qc.invalidateQueries({ queryKey: QUERY_KEYS.documents(kbId) });
      },
    }),
  };
}
