import { describe, expect, it } from 'vitest';
import { createDatabase } from '../client';
import { createEmotionEventRepository } from './emotion-event-repo';

const NOW = '2026-10-12T08:00:00.000Z';
const NOW_MS = Date.parse(NOW);

describe('createEmotionEventRepository（v1.6 M4）', () => {
  it('写入/按助手倒序读取，可空字段回落 null', () => {
    const db = createDatabase();
    db.prepare(
      `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a1','助手','t','t')`,
    ).run();
    const repo = createEmotionEventRepository(db);

    repo.add('a1', { id: 'e1', type: 'praise', source: 'model', emotion: 'joy', intensity: 0.7, timestampMs: NOW_MS });
    repo.add('a1', { id: 'e2', type: 'chat', source: 'rule', timestampMs: NOW_MS + 1000 });
    repo.add('a1', { id: 'e3', type: 'belittle', source: 'default', emotion: 'anger', intensity: 0.5, timestampMs: NOW_MS + 2000 });

    const list = repo.listByAssistant('a1', 10);
    expect(list.map((e) => e.id)).toEqual(['e3', 'e2', 'e1']);
    expect(list[0]!).toMatchObject({ type: 'belittle', source: 'default', emotion: 'anger', intensity: 0.5 });
    expect(list[1]!.emotion).toBeNull();
    expect(list[1]!.intensity).toBeNull();
    expect(list[0]!.createdAt).toBe(new Date(NOW_MS + 2000).toISOString());
    db.close();
  });

  it('消息不存在时写入被外键拒绝；按助手删除返回变更行数', () => {
    const db = createDatabase();
    db.prepare(
      `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a1','助手','t','t')`,
    ).run();
    const repo = createEmotionEventRepository(db);
    expect(() =>
      repo.add('a1', { id: 'bad', type: 'chat', source: 'model', messageId: 'missing', timestampMs: 1000 }),
    ).toThrow(/FOREIGN KEY/);

    repo.add('a1', { id: 'e1', type: 'chat', source: 'model', timestampMs: 1000 });
    expect(repo.deleteByAssistant('a1')).toBe(1);
    expect(repo.listByAssistant('a1')).toHaveLength(0);
    db.close();
  });

  it('restoreOne 幂等（INSERT OR IGNORE，不覆盖已存在事件）', () => {
    const db = createDatabase();
    db.prepare(
      `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a1','助手','t','t')`,
    ).run();
    const repo = createEmotionEventRepository(db);
    repo.restoreOne('a1', {
      id: 'r1',
      type: 'praise',
      source: 'event',
      emotion: 'joy',
      intensity: 0.3,
      messageId: null,
      createdAt: NOW,
    });
    repo.restoreOne('a1', {
      id: 'r1',
      type: 'praise',
      source: 'event',
      emotion: 'joy',
      intensity: 0.9,
      messageId: null,
      createdAt: NOW,
    });
    const list = repo.listByAssistant('a1');
    expect(list).toHaveLength(1);
    expect(list[0]!.intensity).toBe(0.3);
    db.close();
  });

  it('助手删除时事件级联清空', () => {
    const db = createDatabase();
    db.prepare(
      `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a1','助手','t','t')`,
    ).run();
    const repo = createEmotionEventRepository(db);
    repo.add('a1', { id: 'e1', type: 'chat', source: 'model', timestampMs: 1000 });
    db.prepare(`DELETE FROM assistants WHERE id='a1'`).run();
    expect(repo.listByAssistant('a1')).toHaveLength(0);
    expect(repo.listAll()).toHaveLength(0);
    db.close();
  });
});
