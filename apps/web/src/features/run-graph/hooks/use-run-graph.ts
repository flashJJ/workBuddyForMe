'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RunGraphRootKind, RunGraphSnapshot } from '@wbfm/shared/types';
import { apiGet } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';
import { applyRunGraphLiveFrames } from '../model/append-event';
import { runGraphLiveBus, type RunGraphLiveFrame } from '../model/live-bus';

export interface UseRunGraphOptions {
  /** 聊天/会议侧开启：订阅现有 SSE 旁路帧，10 秒快照校准；timeline 关闭 */
  live?: boolean;
}

/** v2.20：过程图快照 + 实时帧合并；历史基线之前不补演。 */
export function useRunGraph(kind: RunGraphRootKind, id: string | null, options: UseRunGraphOptions = {}) {
  const live = options.live === true;
  const [frames, setFrames] = React.useState<RunGraphLiveFrame[]>([]);
  // 分支帧在 query 定义前即可订阅，用 ref 延迟绑定 refetch
  const refetchRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    setFrames([]);
    if (!id || !live) return;
    return runGraphLiveBus.subscribe((frame) => {
      if (frame.rootKind !== kind || frame.rootId !== id) return;
      setFrames((prev) => (prev.length >= 200 ? [...prev.slice(-199), frame] : [...prev, frame]));
    });
  }, [kind, id, live]);

  // v2.22：分支帧到达即拉新快照（服务端投影权威）
  React.useEffect(() => {
    if (!id || !live) return;
    let last = 0;
    return runGraphLiveBus.subscribe((frame) => {
      if (frame.rootKind !== kind || frame.rootId !== id || frame.scope !== 'branch') return;
      const now = Date.now();
      if (now - last < 1000) return;
      last = now;
      void refetchRef.current?.();
    });
  }, [kind, id, live]);

  const query = useQuery<RunGraphSnapshot>({
    queryKey: QUERY_KEYS.runGraph(kind, id ?? ''),
    queryFn: () =>
      apiGet<RunGraphSnapshot>(
        kind === 'meeting' ? API.meetingRunGraph(id!) : API.conversationRunGraph(id!),
      ),
    enabled: Boolean(id),
    refetchInterval: live ? 10000 : false,
    refetchIntervalInBackground: false,
    staleTime: live ? 8000 : 1000,
  });

  React.useEffect(() => {
    refetchRef.current = () => void query.refetch();
  }, [query.refetch]);

  const data = React.useMemo(
    () => (query.data ? applyRunGraphLiveFrames(query.data, frames) : undefined),
    [query.data, frames],
  );

  return { ...query, data };
}
