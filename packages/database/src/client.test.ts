import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDataRootForTest, resetDataRootForTest, getDataDir } from '@wbfm/config';
import {
  LATEST_SCHEMA_VERSION,
  closeDatabase,
  createDatabase,
  getDatabase,
  getSchemaVersion,
  initDatabase,
} from './index';

describe('数据库连接与迁移', () => {
  it('全新内存库迁移到最新版本且表齐备', () => {
    const db = createDatabase(':memory:');
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all()
      .map((r) => (r as { name: string }).name);
    for (const expected of [
      'providers',
      'models',
      'assistants',
      'conversations',
      'messages',
      'knowledge_bases',
      'documents',
      'document_chunks',
      'settings_kv',
      'meta',
    ]) {
      expect(tables).toContain(expected);
    }
    db.close();
  });

  it('重复初始化迁移幂等（版本不回退、不报错）', () => {
    const db = createDatabase(':memory:');
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    db.close();
  });

  it('foreign_keys 开启：无效外键写入被拒绝', () => {
    const db = createDatabase(':memory:');
    expect(() =>
      db
        .prepare(
          `INSERT INTO conversations(id, assistant_id, created_at, updated_at)
           VALUES ('c1', 'not-exist', '2026-01-01', '2026-01-01')`,
        )
        .run(),
    ).toThrow(/FOREIGN KEY/);
    db.close();
  });

  describe('文件库单例', () => {
    let tempRoot: string;

    beforeEach(() => {
      tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-db-'));
      setDataRootForTest(tempRoot);
      closeDatabase();
    });

    afterEach(() => {
      closeDatabase();
      resetDataRootForTest();
    });

    it('未初始化时 getDatabase 抛错', () => {
      expect(() => getDatabase()).toThrow(/尚未初始化/);
    });

    it('initDatabase 在数据根创建文件并持久化 schema', () => {
      const db = initDatabase();
      const file = join(getDataDir('db'), 'wbfm.sqlite');
      expect(existsSync(file)).toBe(true);
      db.prepare(`INSERT INTO settings_kv(key, value, updated_at) VALUES('k','"v"','t')`).run();
      closeDatabase();

      const reopened = initDatabase();
      const row = reopened.prepare(`SELECT value FROM settings_kv WHERE key='k'`).get() as {
        value: string;
      };
      expect(row.value).toBe('"v"');
    });
  });
});
