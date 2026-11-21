import { unwrapEnvelope, type ApiEnvelope } from '@wbfm/shared/api';
import { SEARCH_LIMITS } from '@wbfm/shared/schemas';
import type { DocumentRecord, KnowledgeBase } from '@wbfm/shared/types';
import { withManagedHeaders } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import type { GlobalSearchHit } from '../types';

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, withManagedHeaders({ signal }));
  return unwrapEnvelope((await response.json()) as ApiEnvelope<T>);
}

/** v4.18：文档级结果（标题/来源/摘要，不读取正文） */
export function mapDocumentHit(kb: KnowledgeBase, document: DocumentRecord): GlobalSearchHit {
  return {
    domain: 'knowledge',
    id: document.id,
    title: document.filename,
    snippet: document.sourceUrl ?? `${document.fileType} · ${document.status}`,
    timestamp: document.createdAt,
    deepLink: `/knowledge?kb=${encodeURIComponent(kb.id)}`,
    action: 'open',
  };
}

/**
 * v4.18：知识库文档检索。
 * 先列知识库，再按并发 4、单库最多 5 条查询；单库失败静默跳过，
 * 知识库列表失败由调用方归为该域失败。
 */
export async function searchKnowledge(
  query: string,
  signal: AbortSignal,
): Promise<GlobalSearchHit[]> {
  const bases = await getJson<KnowledgeBase[]>(API.knowledgeBases, signal);
  const queue = [...bases];
  const hits: GlobalSearchHit[] = [];

  const worker = async () => {
    for (;;) {
      const kb = queue.shift();
      if (!kb) return;
      try {
        const docs = await getJson<DocumentRecord[]>(
          `${API.documents(kb.id)}?q=${encodeURIComponent(query)}`,
          signal,
        );
        for (const doc of docs.slice(0, SEARCH_LIMITS.knowledgePerBase)) {
          hits.push(mapDocumentHit(kb, doc));
        }
      } catch {
        if (signal.aborted) return;
        // 单库失败不影响其他知识库
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(SEARCH_LIMITS.knowledgeConcurrency, bases.length) },
      () => worker(),
    ),
  );
  if (signal.aborted) return [];

  const seen = new Set<string>();
  const unique = hits.filter((hit) => {
    if (seen.has(hit.id)) return false;
    seen.add(hit.id);
    return true;
  });
  unique.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));
  return unique.slice(0, SEARCH_LIMITS.perDomain);
}
