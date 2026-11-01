'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CharacterCardRecord } from '@wbfm/shared/character-card';
import { apiDelete, apiGet, apiPost, apiPut, withManagedHeaders } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

export function useCharacterCards() {
  return useQuery({
    queryKey: QUERY_KEYS.characterCards,
    queryFn: () => apiGet<CharacterCardRecord[]>(API.characterCards),
  });
}

/**
 * v1.8 角色卡库变更：建/改/删/复制均失效卡列表与助手列表
 * （助手记录携带 cardId，选卡结果需要同步刷新）。
 */
export function useCharacterCardMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: QUERY_KEYS.characterCards });
    void qc.invalidateQueries({ queryKey: QUERY_KEYS.assistants });
  };

  return {
    create: useMutation({
      mutationFn: (rawMarkdown: string) => apiPost<CharacterCardRecord>(API.characterCards, { rawMarkdown }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, rawMarkdown }: { id: string; rawMarkdown: string }) =>
        apiPut<CharacterCardRecord>(API.characterCard(id), { rawMarkdown }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiDelete<{ id: string }>(API.characterCard(id)),
      onSuccess: invalidate,
    }),
    duplicate: useMutation({
      mutationFn: (id: string) => apiPost<CharacterCardRecord>(API.characterCardDuplicate(id)),
      onSuccess: invalidate,
    }),
    assign: useMutation({
      mutationFn: ({ assistantId, cardId }: { assistantId: string; cardId: string | null }) =>
        apiPut(API.assistantCard(assistantId), { cardId }),
      onSuccess: invalidate,
    }),
  };
}

/** 读取本地 .md 文件为 UTF-8 文本（供导入按钮） */
export function readCardFile(file: File): Promise<string> {
  return file.text();
}

/** 浏览器侧导出卡原文为 .md 下载（带托管令牌头，Electron 下也可用） */
export async function downloadCardMarkdown(card: CharacterCardRecord): Promise<void> {
  const response = await fetch(API.characterCardRaw(card.id), {
    headers: withManagedHeaders().headers as HeadersInit,
  });
  if (!response.ok) throw new Error(`导出失败：${response.status}`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${card.name || 'character-card'}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
