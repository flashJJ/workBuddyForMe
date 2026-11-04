import type { DatabaseInstance } from '../../client';
import type { BranchEvidence, BranchStatus, ConversationBranch } from '@wbfm/shared/types';
import { branchEvidenceSchema } from '@wbfm/shared/schemas';
import { nowIso } from '../ops/mappers';

interface BranchRow {
  id: string;
  parent_conversation_id: string;
  child_conversation_id: string;
  root_conversation_id: string;
  title: string;
  goal: string;
  status: BranchStatus;
  status_reason: string | null;
  return_evidence_json: string | null;
  reserved_tokens: number;
  depth: number;
  archived_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

function parseEvidence(value: string | null): BranchEvidence | null {
  if (!value) return null;
  try {
    const parsed = branchEvidenceSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function toBranch(row: BranchRow): ConversationBranch {
  return {
    id: row.id,
    parentConversationId: row.parent_conversation_id,
    childConversationId: row.child_conversation_id,
    rootConversationId: row.root_conversation_id,
    title: row.title,
    goal: row.goal,
    status: row.status,
    statusReason: row.status_reason,
    reservedTokens: row.reserved_tokens,
    depth: row.depth,
    archivedAt: row.archived_at,
    evidence: parseEvidence(row.return_evidence_json),
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateBranchInput {
  id: string;
  parentConversationId: string;
  childConversationId: string;
  rootConversationId: string;
  title: string;
  goal: string;
  depth: number;
}

export interface PatchBranchInput {
  title?: string;
  status?: BranchStatus;
  statusReason?: string | null;
  evidence?: BranchEvidence | null;
  reservedTokens?: number;
  archivedAt?: string | null;
  endedAt?: string | null;
}

/** v2.21 分支会话仓储：conversation_branches 单表读写；子会话删除时级联删关联。 */
export function createConversationBranchRepository(db: DatabaseInstance) {
  const get = (id: string): ConversationBranch | null => {
    const row = db
      .prepare(`SELECT * FROM conversation_branches WHERE id = ?`)
      .get(id) as BranchRow | undefined;
    return row ? toBranch(row) : null;
  };

  return {
    create(input: CreateBranchInput): ConversationBranch {
      const ts = nowIso();
      db.prepare(
        `INSERT INTO conversation_branches(
           id, parent_conversation_id, child_conversation_id, root_conversation_id,
           title, goal, status, reserved_tokens, depth, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?)`,
      ).run(
        input.id,
        input.parentConversationId,
        input.childConversationId,
        input.rootConversationId,
        input.title,
        input.goal,
        input.depth,
        ts,
        ts,
      );
      return get(input.id)!;
    },

    get,

    /** 某个会话作为子会话所属的分支（祖先链推导用） */
    findByChild(childConversationId: string): ConversationBranch | null {
      const row = db
        .prepare(`SELECT * FROM conversation_branches WHERE child_conversation_id = ?`)
        .get(childConversationId) as BranchRow | undefined;
      return row ? toBranch(row) : null;
    },

    listByParent(parentConversationId: string, includeArchived = false): ConversationBranch[] {
      const sql = includeArchived
        ? `SELECT * FROM conversation_branches WHERE parent_conversation_id = ? ORDER BY created_at ASC`
        : `SELECT * FROM conversation_branches WHERE parent_conversation_id = ? AND archived_at IS NULL ORDER BY created_at ASC`;
      return (db.prepare(sql).all(parentConversationId) as BranchRow[]).map(toBranch);
    },

    listByRoot(rootConversationId: string): ConversationBranch[] {
      return (
        db
          .prepare(`SELECT * FROM conversation_branches WHERE root_conversation_id = ? ORDER BY created_at ASC`)
          .all(rootConversationId) as BranchRow[]
      ).map(toBranch);
    },

    /** v2.21 M4：备份导出用——全量分支关联（按创建时间） */
    listAll(): ConversationBranch[] {
      return (
        db
          .prepare(`SELECT * FROM conversation_branches ORDER BY created_at ASC`)
          .all() as BranchRow[]
      ).map(toBranch);
    },

    /** v2.21 M4：启动收敛用——只取 running/waiting，避免整表扫描 */
    listActive(): ConversationBranch[] {
      return (
        db
          .prepare(
            `SELECT * FROM conversation_branches WHERE status IN ('running','waiting') ORDER BY created_at ASC`,
          )
          .all() as BranchRow[]
      ).map(toBranch);
    },

    patch(id: string, patch: PatchBranchInput): ConversationBranch | null {
      const existing = get(id);
      if (!existing) return null;
      const sets: string[] = [];
      const values: unknown[] = [];
      const set = (column: string, value: unknown) => {
        sets.push(`${column} = ?`);
        values.push(value);
      };
      if (patch.title !== undefined) set('title', patch.title);
      if (patch.status !== undefined) set('status', patch.status);
      if (patch.statusReason !== undefined) set('status_reason', patch.statusReason);
      if (patch.evidence !== undefined) {
        set('return_evidence_json', patch.evidence === null ? null : JSON.stringify(patch.evidence));
      }
      if (patch.reservedTokens !== undefined) set('reserved_tokens', patch.reservedTokens);
      if (patch.archivedAt !== undefined) set('archived_at', patch.archivedAt);
      if (patch.endedAt !== undefined) set('ended_at', patch.endedAt);
      set('updated_at', nowIso());
      db.prepare(`UPDATE conversation_branches SET ${sets.join(', ')} WHERE id = ?`).run(
        ...values,
        id,
      );
      return get(id);
    },

    delete(id: string): boolean {
      return db.prepare(`DELETE FROM conversation_branches WHERE id = ?`).run(id).changes > 0;
    },
  };
}

export type ConversationBranchRepository = ReturnType<typeof createConversationBranchRepository>;
