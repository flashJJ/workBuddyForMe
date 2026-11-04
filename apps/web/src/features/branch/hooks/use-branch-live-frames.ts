'use client';

import * as React from 'react';
import type { ConversationBranch } from '@wbfm/shared/types';
import { runGraphLiveBus } from '@/features/run-graph';
import { diffBranchFrames } from '../model/branch-frames';

/** v2.22：分支面板轮询结果变化时发布图帧；面板关闭即停止，图侧保留 10s 快照兜底 */
export function useBranchLiveFrames(
  rootConversationId: string | null,
  branches: readonly ConversationBranch[],
): void {
  const prev = React.useRef<ReadonlyMap<string, ConversationBranch>>(new Map());

  React.useEffect(() => {
    if (!rootConversationId) return;
    const frames = diffBranchFrames(prev.current, branches, rootConversationId);
    for (const frame of frames) runGraphLiveBus.publish(frame);
    prev.current = new Map(branches.map((branch) => [branch.id, branch]));
  }, [rootConversationId, branches]);
}
