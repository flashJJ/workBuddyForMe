'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EventTriggerCreateInput,
  EventTriggerUpdateInput,
  EventTriggerView,
} from '@wbfm/shared/schemas';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client';

/** v1.7 M5 自定义短语触发器查询键 */
export const EVENT_TRIGGERS_QUERY_KEY = ['event-triggers'] as const;

export function useEventTriggers(assistantId?: string) {
  return useQuery({
    queryKey: assistantId
      ? [...EVENT_TRIGGERS_QUERY_KEY, assistantId]
      : EVENT_TRIGGERS_QUERY_KEY,
    queryFn: async () => {
      const data = await apiGet<EventTriggerView[] | unknown>(
        assistantId
          ? `/api/event-triggers?assistantId=${encodeURIComponent(assistantId)}`
          : '/api/event-triggers',
      );
      // 防御：非数组响应（测试 mock/异常网关）按空列表处理
      return Array.isArray(data) ? (data as EventTriggerView[]) : [];
    },
  });
}

export function useEventTriggerMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: EVENT_TRIGGERS_QUERY_KEY });

  return {
    create: useMutation({
      mutationFn: (body: EventTriggerCreateInput) =>
        apiPost<EventTriggerView>('/api/event-triggers', body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: EventTriggerUpdateInput }) =>
        apiPatch<EventTriggerView>(`/api/event-triggers/${encodeURIComponent(id)}`, patch),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) =>
        apiDelete<{ id: string }>(`/api/event-triggers/${encodeURIComponent(id)}`),
      onSuccess: invalidate,
    }),
  };
}
