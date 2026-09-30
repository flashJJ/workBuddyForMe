import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrateV001 } from './v001-initial-schema';
import { migrateV002 } from './v002-tools';
import { migrateV003 } from './v003-multimodal';
import { migrateV004 } from './v004-ocr';
import { migrateV005 } from './v005-conversation-summary';
import { migrateV006 } from './v006-memory';
import { migrateV007 } from './v007-message-feedback';
import { applyMigrations, LATEST_SCHEMA_VERSION } from './runner';

/** 构造停在 v7 的库 */
function createV7Database(): Database.Database {
  const db = new Database(':memory:');
  migrateV001(db);
  migrateV002(db);
  migrateV003(db);
  migrateV004(db);
  migrateV005(db);
  migrateV006(db);
  migrateV007(db);
  db.pragma('user_version = 7');
  return db;
}

describe('v008 迁移：MCP 服务器（mcp_servers）', () => {
  it('v7 老库升级：表可写，name 唯一，transport 受 CHECK 约束', () => {
    const db = createV7Database();
    const result = applyMigrations(db);
    expect(result.applied).toEqual([8, 9, 10, 11]);
    expect(LATEST_SCHEMA_VERSION).toBe(11);

    const ts = '2026-09-27T00:00:00.000Z';
    db.prepare(
      `INSERT INTO mcp_servers(id, transport, name, command, args, env, enabled, created_at, updated_at)
       VALUES ('s1', 'stdio', 'filesystem', 'npx', '["-y","server-filesystem"]', '{}', 1, ?, ?)`,
    ).run(ts, ts);
    const row = db.prepare(`SELECT * FROM mcp_servers WHERE id='s1'`).get() as {
      args: string;
      url: string;
      enabled: number;
    };
    expect(JSON.parse(row.args)).toEqual(['-y', 'server-filesystem']);
    expect(row.url).toBe('');
    expect(row.enabled).toBe(1);

    // 同名服务器被唯一索引拒绝
    expect(() =>
      db
        .prepare(
          `INSERT INTO mcp_servers(id, transport, name, command, created_at, updated_at)
           VALUES ('s2', 'stdio', 'filesystem', 'x', ?, ?)`,
        )
        .run(ts, ts),
    ).toThrow();
    // 非法 transport 被拒绝
    expect(() =>
      db
        .prepare(
          `INSERT INTO mcp_servers(id, transport, name, command, created_at, updated_at)
           VALUES ('s3', 'websocket', 'x', 'y', ?, ?)`,
        )
        .run(ts, ts),
    ).toThrow();
    db.close();
  });

  it('user_version 门控：已升级到 v8 的库不重复应用', () => {
    const db = createV7Database();
    applyMigrations(db);
    expect(applyMigrations(db).applied).toEqual([]);
    db.close();
  });
});
