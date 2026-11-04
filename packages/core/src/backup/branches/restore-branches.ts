/**
 * v2.21 M4：分支关联恢复（conversations 轨 branches.json）。
 * 顺序要求：父/子会话先恢复；缺失任一则跳过并计数。
 * 运行中/等待中的分支按契约改写为 interrupted，预留归零；归档与终态保留。
 */
import type { DatabaseInstance } from '@wbfm/database';
import type { BranchStatus, ConversationBranch } from '@wbfm/shared/types';
import { branchEvidenceSchema, branchStatusSchema } from '@wbfm/shared/schemas';

export interface BranchRestoreCounts {
  imported: number;
  skipped: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** 非法条目（缺 id/标题/目标/深度）直接跳过，不阻断整档恢复 */
function toEntry(raw: unknown): {
  id: string;
  parent: string;
  child: string;
  root: string;
  title: string;
  goal: string;
  status: BranchStatus;
  statusReason: string | null;
  evidenceJson: string | null;
  depth: number;
  archivedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
} | null {
  if (!isRecord(raw)) return null;
  const id = text(raw.id);
  const parent = text(raw.parentConversationId);
  const child = text(raw.childConversationId);
  const root = text(raw.rootConversationId);
  const title = text(raw.title);
  const goal = text(raw.goal);
  const depth = typeof raw.depth === 'number' ? raw.depth : 0;
  if (!id || !parent || !child || !root || !title || !goal || depth < 1) return null;

  const parsedStatus = branchStatusSchema.safeParse(raw.status);
  const sourceStatus: BranchStatus = parsedStatus.success ? parsedStatus.data : 'interrupted';
  const active = sourceStatus === 'running' || sourceStatus === 'waiting';
  const statusReason = active
    ? '恢复时运行中断'
    : typeof raw.statusReason === 'string'
      ? raw.statusReason
      : null;
  const parsedEvidence = branchEvidenceSchema.safeParse(raw.evidence);
  const now = new Date().toISOString();
  const endedAt = active
    ? now
    : typeof raw.endedAt === 'string'
      ? raw.endedAt
      : null;

  return {
    id,
    parent,
    child,
    root,
    title,
    goal,
    status: active ? 'interrupted' : sourceStatus,
    statusReason,
    evidenceJson: parsedEvidence.success ? JSON.stringify(parsedEvidence.data) : null,
    depth,
    archivedAt: typeof raw.archivedAt === 'string' ? raw.archivedAt : null,
    endedAt,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: now,
  };
}

export function restoreBranches(db: DatabaseInstance, buf: Buffer): BranchRestoreCounts {
  const rows: unknown = JSON.parse(buf.toString('utf-8'));
  const entries = Array.isArray(rows) ? rows : [];
  const conversationExists = db.prepare(`SELECT 1 FROM conversations WHERE id = ?`);
  const insert = db.prepare(
    `INSERT OR IGNORE INTO conversation_branches(
       id, parent_conversation_id, child_conversation_id, root_conversation_id,
       title, goal, status, status_reason, return_evidence_json, reserved_tokens,
       depth, archived_at, ended_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
  );

  let imported = 0;
  let skipped = 0;
  for (const raw of entries) {
    const entry = toEntry(raw);
    if (!entry || !conversationExists.get(entry.parent) || !conversationExists.get(entry.child)) {
      skipped++;
      continue;
    }
    const result = insert.run(
      entry.id,
      entry.parent,
      entry.child,
      entry.root,
      entry.title,
      entry.goal,
      entry.status,
      entry.statusReason,
      entry.evidenceJson,
      entry.depth,
      entry.archivedAt,
      entry.endedAt,
      entry.createdAt,
      entry.updatedAt,
    );
    if (result.changes > 0) imported++;
    else skipped++;
  }
  return { imported, skipped };
}

/** 备份条目形状（导出端直接用仓储返回的 ConversationBranch，字段已对齐） */
export type BranchBackupEntry = ConversationBranch;
