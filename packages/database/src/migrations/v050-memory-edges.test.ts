import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

function names(db: Database.Database, type: 'table' | 'index'): Set<string> {
  return new Set(
    (
      db.prepare(`SELECT name FROM sqlite_master WHERE type = ?`).all(type) as Array<{
        name: string;
      }>
    ).map((row) => row.name),
  );
}

describe('v050 迁移：记忆关系边', () => {
  it('全新库：版本 50，边表与双向索引就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(51);
    expect(LATEST_SCHEMA_VERSION).toBe(51);

    expect(names(db, 'table').has('memory_edges')).toBe(true);
    const columns = new Set(
      (db.prepare(`PRAGMA table_info(memory_edges)`).all() as Array<{ name: string }>).map(
        (row) => row.name,
      ),
    );
    expect(columns).toEqual(
      new Set(['id', 'from_id', 'to_id', 'relation', 'weight', 'created_at']),
    );
    const indexes = names(db, 'index');
    expect(indexes.has('idx_memory_edges_from')).toBe(true);
    expect(indexes.has('idx_memory_edges_to')).toBe(true);
    db.close();
  });

  it('旧库升级：49 → 51 纯加法，存量记忆不受影响', () => {
    const db = new Database(':memory:');
    applyMigrations(db, 49);
    db.prepare(
      `INSERT INTO memories(kind, content, importance, status, created_at, updated_at,
         scope, source, pinned, confidence, version, valid_from, last_confirmed_at)
       VALUES ('fact', '用户住在杭州', 0.8, 'active', '2026-01-01T00:00:00.000Z',
         '2026-01-01T00:00:00.000Z', 'global', 'extract', 0, 1, 1,
         '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    ).run();

    const result = applyMigrations(db);
    expect(result.applied).toEqual([50, 51]);
    expect(getSchemaVersion(db)).toBe(51);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM memories`).get() as { n: number }).n).toBe(1);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM memory_edges`).get() as { n: number }).n).toBe(0);
    db.close();
  });

  it('同一对记忆同一关系只落一条，重复写入保留更高权重', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    const insert = db.prepare(
      `INSERT INTO memory_edges(id, from_id, to_id, relation, weight, created_at)
       VALUES (?, '1', '2', 'same_source', ?, '2026-01-01T00:00:00.000Z')
       ON CONFLICT (from_id, to_id, relation)
       DO UPDATE SET weight = MAX(memory_edges.weight, excluded.weight)`,
    );
    insert.run('e1', 0.5);
    insert.run('e2', 0.8);
    const rows = db.prepare(`SELECT id, weight FROM memory_edges`).all() as Array<{
      id: string;
      weight: number;
    }>;
    expect(rows).toEqual([{ id: 'e1', weight: 0.8 }]);
    db.close();
  });
});
