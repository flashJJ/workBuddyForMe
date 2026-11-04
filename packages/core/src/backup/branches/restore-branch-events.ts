/**
 * v2.22 M1：分支事件恢复（conversations 轨 branch-events.json）。
 * 必须在分支关联恢复之后调用；分支不存在的事件整条跳过。
 * seq 由 session_events 仓储重新分配，createdAt 保留原值，数组顺序即事件顺序。
 */
import type { DatabaseInstance } from '@wbfm/database';
import { createSessionEventRepository } from '@wbfm/database';

export interface BranchEventRestoreCounts {
  imported: number;
  skipped: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function restoreBranchEvents(
  db: DatabaseInstance,
  buf: Buffer,
): BranchEventRestoreCounts {
  let payload: unknown;
  try {
    payload = JSON.parse(buf.toString('utf-8'));
  } catch {
    return { imported: 0, skipped: 0 };
  }
  const events = isRecord(payload) && Array.isArray(payload.events) ? payload.events : [];
  const eventsRepo = createSessionEventRepository(db);
  const branchExists = db.prepare('SELECT 1 FROM conversation_branches WHERE id = ?');

  let imported = 0;
  let skipped = 0;
  for (const raw of events) {
    if (
      !isRecord(raw) ||
      raw.scope !== 'branch' ||
      typeof raw.scopeId !== 'string' ||
      typeof raw.type !== 'string' ||
      !branchExists.get(raw.scopeId)
    ) {
      skipped++;
      continue;
    }
    try {
      eventsRepo.append({
        scope: 'branch',
        scopeId: raw.scopeId,
        type: raw.type,
        payload: raw.payload ?? null,
        schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1,
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
      });
      imported++;
    } catch {
      // 单条损坏不阻断整档恢复
      skipped++;
    }
  }
  return { imported, skipped };
}
