'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';
import {
  parseSceneSnapshotEntries,
  summarizeSceneSnapshots,
  type SceneSnapshotEventItem,
  type SceneSnapshotSummary,
} from './scene-snapshot-events';

export type SceneSnapshotScope = 'task' | 'flow' | 'agent';

interface EventsResponse {
  items: SceneSnapshotEventItem[];
}

export interface UseSceneSnapshotsOptions {
  enabled?: boolean;
  refetchInterval?: number | false;
}

/** v4.10：按 scope 拉取事件并汇总场景快照（任务详情 / Flow 执行面板共用） */
export function useSceneSnapshots(
  scope: SceneSnapshotScope,
  scopeId: string | null,
  options: UseSceneSnapshotsOptions = {},
): {
  summary: SceneSnapshotSummary;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const query = useQuery<EventsResponse>({
    queryKey: [...QUERY_KEYS.events(scope, scopeId ?? ''), 'scene-snapshots'],
    queryFn: () => apiGet<EventsResponse>(API.events(scope, scopeId!)),
    enabled: Boolean(scopeId) && (options.enabled ?? true),
    staleTime: 5_000,
    ...(options.refetchInterval !== undefined
      ? { refetchInterval: options.refetchInterval }
      : {}),
  });

  const summary = React.useMemo(
    () => summarizeSceneSnapshots(parseSceneSnapshotEntries(query.data?.items ?? [])),
    [query.data],
  );

  return {
    summary,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
