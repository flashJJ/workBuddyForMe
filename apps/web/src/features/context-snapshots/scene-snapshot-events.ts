import {
  sceneContextSnapshotPayloadSchema,
  type ContextSceneRole,
  type SceneContextSnapshotPayload,
} from '@wbfm/shared/schemas';

/** v4.10：协作/任务/Flow 场景快照的解析与汇总（纯函数，供面板与测试共用） */

export interface SceneSnapshotEventItem {
  id: string;
  at: string;
  type: string;
  payload: unknown;
}

export interface SceneSnapshotEntry {
  value: SceneContextSnapshotPayload;
  /** 来自 /api/events 的 createdAt；SSE 来源可缺省 */
  at?: string;
  id?: string;
}

export interface SceneSnapshotSummary {
  /** 最近 N 条，保持输入顺序 */
  entries: SceneSnapshotEntry[];
  /** planner → executor → reviewer 各自最新一条；无角色场景为空 */
  latestByRole: Array<{ role: ContextSceneRole; entry: SceneSnapshotEntry }>;
  /** 最近一条（不分角色） */
  latest: SceneSnapshotEntry | null;
  /** entries 中 truncated=true 的条数 */
  truncatedCount: number;
  hasTruncated: boolean;
}

const ROLE_ORDER: ContextSceneRole[] = ['planner', 'executor', 'reviewer'];
const DEFAULT_LIMIT = 20;

export function parseSceneSnapshotEntries(
  items: readonly SceneSnapshotEventItem[],
): SceneSnapshotEntry[] {
  const entries: SceneSnapshotEntry[] = [];
  for (const item of items) {
    if (item.type !== 'context_scene_snapshot') continue;
    const parsed = sceneContextSnapshotPayloadSchema.safeParse(item.payload);
    if (!parsed.success) continue;
    entries.push({ value: parsed.data, at: item.at, id: item.id });
  }
  return entries;
}

function latestForRole(
  entries: readonly SceneSnapshotEntry[],
  role: ContextSceneRole,
): SceneSnapshotEntry | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    if (entry.value.role === role) return entry;
  }
  return null;
}

export function summarizeSceneSnapshots(
  entries: readonly SceneSnapshotEntry[],
  limit = DEFAULT_LIMIT,
): SceneSnapshotSummary {
  const size = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_LIMIT;
  const recent = entries.slice(-size);
  const latestByRole: SceneSnapshotSummary['latestByRole'] = [];
  for (const role of ROLE_ORDER) {
    const entry = latestForRole(recent, role);
    if (entry) latestByRole.push({ role, entry });
  }
  const truncatedCount = recent.filter((entry) => entry.value.truncated).length;
  return {
    entries: recent,
    latestByRole,
    latest: recent.length > 0 ? recent[recent.length - 1]! : null,
    truncatedCount,
    hasTruncated: truncatedCount > 0,
  };
}

/** 无角色场景（任务/Flow）按 scene 取最新一条，保持首次出现顺序 */
export function latestByScene(
  entries: readonly SceneSnapshotEntry[],
): Array<{ scene: SceneContextSnapshotPayload['scene']; entry: SceneSnapshotEntry }> {
  const scenes: Array<SceneContextSnapshotPayload['scene']> = [];
  for (const entry of entries) {
    if (!scenes.includes(entry.value.scene)) scenes.push(entry.value.scene);
  }
  return scenes.map((scene) => {
    const entry = [...entries].reverse().find((item) => item.value.scene === scene)!;
    return { scene, entry };
  });
}
