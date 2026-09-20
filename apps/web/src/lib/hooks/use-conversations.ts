'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Conversation, Message } from '@wbfm/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

export function useConversations(assistantId?: string) {
  const path = assistantId
    ? `${API.conversations}?assistantId=${encodeURIComponent(assistantId)}`
    : API.conversations;
  return useQuery({
    queryKey: [...QUERY_KEYS.conversations, assistantId ?? 'all'],
    queryFn: () => apiGet<Conversation[]>(path),
  });
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.messages(conversationId ?? '_'),
    queryFn: () => apiGet<Message[]>(API.messages(conversationId!)),
    enabled: Boolean(conversationId),
  });
}

export function useConversationMutations() {
  const qc = useQueryClient();
  return {
    create: useMutation({
      mutationFn: (body: { assistantId: string; title?: string }) =>
        apiPost<Conversation>(API.conversations, body),
      onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.conversations }),
    }),
    rename: useMutation({
      mutationFn: ({ id, title }: { id: string; title: string }) =>
        apiPatch<Conversation>(API.conversation(id), { title }),
      onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.conversations }),
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiDelete<{ id: string }>(API.conversation(id)),
      onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.conversations }),
    }),
  };
}
