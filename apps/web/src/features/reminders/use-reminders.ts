'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ScheduledTaskCreateInput,
  ScheduledTaskUpdateInput,
  ScheduledTaskView,
} from '@wbfm/shared/schemas';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client';

/** v1.7 角色化提醒查询键（全量列表，面板按助手分组展示） */
export const REMINDERS_QUERY_KEY = ['schedules'] as const;

export function useReminders(assistantId?: string) {
  return useQuery({
    queryKey: assistantId ? [...REMINDERS_QUERY_KEY, assistantId] : REMINDERS_QUERY_KEY,
    queryFn: () =>
      apiGet<ScheduledTaskView[]>(
        assistantId
          ? `/api/schedules?assistantId=${encodeURIComponent(assistantId)}`
          : '/api/schedules',
      ),
  });
}

export function useReminderMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: REMINDERS_QUERY_KEY });

  return {
    create: useMutation({
      mutationFn: (body: ScheduledTaskCreateInput) =>
        apiPost<ScheduledTaskView>('/api/schedules', body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: ScheduledTaskUpdateInput }) =>
        apiPatch<ScheduledTaskView>(`/api/schedules/${encodeURIComponent(id)}`, patch),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiDelete<{ id: string }>(`/api/schedules/${encodeURIComponent(id)}`),
      onSuccess: invalidate,
    }),
  };
}
