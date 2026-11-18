import type { SceneContextSnapshotPayload } from '@wbfm/shared/schemas';
import type { ServiceDeps } from '../services/base/deps';

/**
 * v4.9 场景快照：协作 / 桌面任务 / Flow 的上下文预算结果。
 * 复用 session_events，scopeId 分别为 agentRunId / taskRunId / flowRunId。
 */

export const CONTEXT_SCENE_SNAPSHOT_EVENT = 'context_scene_snapshot';

export type SceneSnapshotScope = 'agent' | 'task' | 'flow';

export interface RecordSceneSnapshotInput {
  scope: SceneSnapshotScope;
  scopeId: string;
  payload: SceneContextSnapshotPayload;
}

export function recordSceneSnapshot(
  deps: Pick<ServiceDeps, 'events'> | null | undefined,
  input: RecordSceneSnapshotInput,
): void {
  deps?.events?.record({
    scope: input.scope,
    scopeId: input.scopeId,
    type: CONTEXT_SCENE_SNAPSHOT_EVENT,
    payload: input.payload,
  });
}
