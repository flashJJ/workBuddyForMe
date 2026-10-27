'use client';

import * as React from 'react';
import type {
  MeetingActionItemCreateInput,
  MeetingActionItemUpdateInput,
  MeetingConclusionUpdateInput,
  ScheduledTaskView,
} from '@wbfm/shared/schemas';
import type { MeetingActionItemRecord, MeetingConclusionView } from '@wbfm/shared/types';
import { API } from '@/lib/api/endpoints';
import { apiGet, apiPatch, apiPost, ApiClientError, withManagedHeaders } from '@/lib/api/client';

interface ReminderResult {
  reminder: ScheduledTaskView;
  actionItem: MeetingActionItemRecord;
}

interface FlowResult {
  runId: string;
  workflowId: string;
  actionItem: MeetingActionItemRecord;
}

/** v2.6 M3：结论 + 行动项读取与闭环动作（组件只管展示与 toast） */
export function useMeetingConclusion(meetingId: string) {
  const [view, setView] = React.useState<MeetingConclusionView | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<unknown>(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setView(await apiGet<MeetingConclusionView>(API.meetingConclusion(meetingId)));
    } catch (cause) {
      setError(cause);
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const replaceItem = React.useCallback((item: MeetingActionItemRecord) => {
    setView((current) =>
      current
        ? {
            ...current,
            actionItems: current.actionItems.some((x) => x.id === item.id)
              ? current.actionItems.map((x) => (x.id === item.id ? item : x))
              : [...current.actionItems, item],
          }
        : current,
    );
  }, []);

  return {
    view,
    loading,
    error,
    reload,

    async generate() {
      const next = await apiPost<MeetingConclusionView>(API.meetingConclusion(meetingId));
      setView(next);
      return next;
    },

    async updateConclusion(input: MeetingConclusionUpdateInput) {
      const next = await apiPatch<MeetingConclusionView>(API.meetingConclusion(meetingId), input);
      setView(next);
      return next;
    },

    async createItem(input: MeetingActionItemCreateInput) {
      const item = await apiPost<MeetingActionItemRecord>(API.meetingActionItems(meetingId), input);
      replaceItem(item);
      return item;
    },

    async updateItem(itemId: string, input: MeetingActionItemUpdateInput) {
      const item = await apiPatch<MeetingActionItemRecord>(
        API.meetingActionItem(meetingId, itemId),
        input,
      );
      replaceItem(item);
      return item;
    },

    async toReminder(itemId: string, assistantId: string, timezone: string) {
      const result = await apiPost<ReminderResult>(
        API.meetingActionItemReminder(meetingId, itemId),
        { assistantId, timezone },
      );
      replaceItem(result.actionItem);
      return result.reminder;
    },

    async runFlow(itemId: string, workflowId: string) {
      const result = await apiPost<FlowResult>(
        API.meetingActionItemRunFlow(meetingId, itemId),
        { workflowId },
      );
      replaceItem(result.actionItem);
      return result;
    },

    async exportMarkdown(locale: 'zh' | 'en') {
      const response = await fetch(
        `${API.meetingExport(meetingId)}?format=markdown&locale=${locale}`,
        withManagedHeaders(),
      );
      if (!response.ok) {
        throw new ApiClientError('INTERNAL_ERROR', '', response.status);
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') ?? '';
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `meeting-${meetingId}.md`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  };
}
