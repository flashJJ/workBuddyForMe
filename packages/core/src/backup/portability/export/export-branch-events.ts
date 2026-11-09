/**
 * v2.33：conversations 轨的分支事件序列化（从 export.ts 迁出以满足 300 行门禁）。
 * v2.22 口径：单分支最多 200 条，超出只带最近记录并标记 truncated。
 */
import {
  createConversationBranchRepository,
  createSessionEventRepository,
  type DatabaseInstance,
  type SessionEventView,
} from '@wbfm/database';

const MAX_BRANCH_EVENTS_PER_BRANCH = 200;

export interface BranchEventsPayload {
  json: string;
  count: number;
  truncated: boolean;
}

/** v2.34：增量只保留 since 之后的新分支事件 */
export function filterBranchEvents(
  payload: BranchEventsPayload,
  since?: string,
): BranchEventsPayload {
  if (!since) return payload;
  try {
    const parsed = JSON.parse(payload.json) as { events?: SessionEventView[] };
    const events = (parsed.events ?? []).filter((event) => event.createdAt > since);
    return {
      json: JSON.stringify({ ...parsed, events }, null, 2),
      count: events.length,
      truncated: payload.truncated,
    };
  } catch {
    return payload;
  }
}

/** 导出 branch 事件（scope='branch'），恢复端按数组顺序 append */
export function serializeBranchEvents(db: DatabaseInstance): BranchEventsPayload {
  const eventsRepo = createSessionEventRepository(db);
  const branches = createConversationBranchRepository(db).listAll();
  const groups: SessionEventView[][] = [];
  let truncated = false;
  for (const branch of branches) {
    const recent = eventsRepo
      .listAll({ scope: 'branch', scopeId: branch.id, limit: MAX_BRANCH_EVENTS_PER_BRANCH })
      .reverse();
    if (eventsRepo.count('branch', branch.id) > MAX_BRANCH_EVENTS_PER_BRANCH) truncated = true;
    groups.push(recent);
  }
  const events = groups
    .flat()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.seq - b.seq);
  return {
    json: JSON.stringify({ schemaVersion: 1, truncated, events }, null, 2),
    count: events.length,
    truncated,
  };
}
