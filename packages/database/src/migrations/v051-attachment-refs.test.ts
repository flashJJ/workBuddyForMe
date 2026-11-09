import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '../client';
import {
  createAttachmentRefRepository,
  createMessageRepository,
  registerMessageAttachmentRefs,
} from '../repositories';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

function insertAttachment(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO attachments(id, filename, mime_type, byte_size, storage_path, content_hash, created_at)
     VALUES (?, ?, 'image/png', 1, ?, ?, '2026-01-01T00:00:00.000Z')`,
  ).run(id, `${id}.png`, `${id}.png`, `hash-${id}`);
}

function seedConversation(db: Database.Database): void {
  db.prepare(`INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a','助手','t','t')`).run();
  db.prepare(
    `INSERT INTO conversations(id,assistant_id,title,created_at,updated_at) VALUES('c','a','t','t','t')`,
  ).run();
}

function addImageMessage(db: Database.Database, attachmentIds: string[]): string {
  return createMessageRepository(db).add({
    conversationId: 'c',
    role: 'user',
    content: '看图',
    status: 'completed',
    contentParts: attachmentIds.map((attachmentId) => ({ type: 'image', attachmentId })),
  }).id;
}

describe('v051 迁移：附件引用计数', () => {
  it('全新库：版本 51，引用表/owner 索引/消息删除触发器就位', () => {
    const db = createDatabase(':memory:');
    expect(getSchemaVersion(db)).toBe(51);
    expect(LATEST_SCHEMA_VERSION).toBe(51);

    const names = new Set(
      (db.prepare(`SELECT name FROM sqlite_master`).all() as Array<{ name: string }>).map(
        (row) => row.name,
      ),
    );
    expect(names.has('attachment_refs')).toBe(true);
    expect(names.has('idx_attachment_refs_owner')).toBe(true);
    expect(names.has('trg_messages_attachment_refs_delete')).toBe(true);
    db.close();
  });

  it('消息写入登记、重复登记幂等、删除消息/会话/附件均级联清理', () => {
    const db = createDatabase(':memory:');
    seedConversation(db);
    insertAttachment(db, 'att1');
    insertAttachment(db, 'att2');
    const refs = createAttachmentRefRepository(db);

    const messageId = addImageMessage(db, ['att1', 'att2']);
    expect(refs.listByOwner('message', messageId)).toHaveLength(2);

    // 重复登记（回填/重复调用）不产生重复行
    registerMessageAttachmentRefs(db, messageId, [
      { type: 'image', attachmentId: 'att1' },
      { type: 'image', attachmentId: 'att2' },
    ]);
    expect(refs.listByOwner('message', messageId)).toHaveLength(2);

    db.prepare(`DELETE FROM messages WHERE id = ?`).run(messageId);
    expect(refs.listByOwner('message', messageId)).toHaveLength(0);

    const secondId = addImageMessage(db, ['att1']);
    expect(refs.list()).toHaveLength(1);
    db.prepare(`DELETE FROM conversations WHERE id = 'c'`).run();
    expect(refs.listByOwner('message', secondId)).toHaveLength(0);

    db.prepare(
      `INSERT INTO conversations(id,assistant_id,title,created_at,updated_at) VALUES('c','a','t','t','t')`,
    ).run();
    const thirdId = addImageMessage(db, ['att2']);
    expect(refs.list()).toHaveLength(1);
    db.prepare(`DELETE FROM attachments WHERE id = 'att2'`).run();
    expect(refs.listByOwner('message', thirdId)).toHaveLength(0);
    db.close();
  });

  it('v50 旧库升级：51 纯加法，存量附件与消息不受影响', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db, 50);
    seedConversation(db);
    insertAttachment(db, 'att1');

    const result = applyMigrations(db);
    expect(result.applied).toEqual([51]);
    expect(getSchemaVersion(db)).toBe(51);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM attachments`).get() as { n: number }).n).toBe(1);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM attachment_refs`).get() as { n: number }).n).toBe(0);
    db.close();
  });
});
