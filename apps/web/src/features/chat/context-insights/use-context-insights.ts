'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';
import {
  summarizeContextEvents,
  type ContextEventItem,
  type ContextInsightsData,
} from './context-events';

interface EventsResponse {
  items: ContextEventItem[];
}

/** v4.8：拉取会话事件并汇总为意图/快照/压缩记录（复用 /api/events） */
export function useContextInsights(conversationId: string | null): {
  insights: ContextInsightsData;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const query = useQuery<EventsResponse>({
    queryKey: [...QUERY_KEYS.events('chat', conversationId ?? ''), 'context-insights'],
    queryFn: () => apiGet<EventsResponse>(API.events('chat', conversationId!)),
    enabled: Boolean(conversationId),
    staleTime: 5_000,
  });

  const insights = React.useMemo(
    () => summarizeContextEvents(query.data?.items ?? []),
    [query.data],
  );

  return {
    insights,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
