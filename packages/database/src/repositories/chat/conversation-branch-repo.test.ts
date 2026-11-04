import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../migrations/runner';
import { createConversationBranchRepository } from '../index';

function setupDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  db.prepare(
    `INSERT INTO assistants(id, name, created_at, updated_at) VALUES ('a1', 'A', 't', 't')`,
  ).run();
  for (const id of ['p1', 'c1', 'c2', 'r1']) {
    db.prepare(
      `INSERT INTO conversations(id, assistant_id, title, created_at, updated_at)
       VALUES (?, 'a1', ?, 't', 't')`,
    ).run(id, id);
  }
  return db;
}

const evidence = {
  branchId: 'b1',
  parentConversationId: 'p1',
  childConversationId: 'c1',
  rootConversationId: 'r1',
  status: 'succeeded' as const,
  summary: '完成调研',
  artifacts: [],
  usage: null,
  needsReview: true as const,
  createdAt: '2026-11-04T00:00:00.000Z',
};

describe('v2.21 分支会话仓储', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = setupDb();
  });

  it('创建默认为 queued，按父/根可查', () => {
    const repo = createConversationBranchRepository(db);
    const branch = repo.create({
      id: 'b1',
      parentConversationId: 'p1',
      childConversationId: 'c1',
      rootConversationId: 'r1',
      title: '竞品调研',
      goal: '整理竞品',
      depth: 2,
    });
    expect(branch).toMatchObject({
      id: 'b1',
      status: 'queued',
      reservedTokens: 0,
      depth: 2,
      archivedAt: null,
      evidence: null,
    });
    expect(repo.listByParent('p1')).toHaveLength(1);
    expect(repo.listByRoot('r1')).toHaveLength(1);
    expect(repo.get('missing')).toBeNull();
  });

  it('patch 状态/证据/预留/归档；损坏证据回落 null', () => {
    const repo = createConversationBranchRepository(db);
    repo.create({
      id: 'b1',
      parentConversationId: 'p1',
      childConversationId: 'c1',
      rootConversationId: 'r1',
      title: '分支',
      goal: '目标',
      depth: 2,
    });
    const patched = repo.patch('b1', {
      status: 'succeeded',
      evidence,
      reservedTokens: 1200,
      endedAt: '2026-11-04T00:01:00.000Z',
      archivedAt: '2026-11-04T00:02:00.000Z',
    });
    expect(patched).toMatchObject({ status: 'succeeded', reservedTokens: 1200, evidence });

    expect(repo.listByParent('p1')).toHaveLength(0);
    expect(repo.listByParent('p1', true)).toHaveLength(1);

    db.prepare(`UPDATE conversation_branches SET return_evidence_json = '{bad' WHERE id = 'b1'`).run();
    expect(repo.get('b1')!.evidence).toBeNull();
  });

  it('删除只删关联，不留分支行', () => {
    const repo = createConversationBranchRepository(db);
    repo.create({
      id: 'b1',
      parentConversationId: 'p1',
      childConversationId: 'c1',
      rootConversationId: 'r1',
      title: '分支',
      goal: '目标',
      depth: 2,
    });
    expect(repo.delete('b1')).toBe(true);
    expect(repo.get('b1')).toBeNull();
    expect(
      db.prepare(`SELECT COUNT(*) AS n FROM conversations WHERE id = 'c1'`).get(),
    ).toEqual({ n: 1 });
  });
});
