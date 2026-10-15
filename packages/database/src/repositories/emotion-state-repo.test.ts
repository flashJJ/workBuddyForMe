import { describe, expect, it } from 'vitest';
import { createDatabase } from '../client';
import { createEmotionStateRepository } from './emotion-state-repo';
import { createDefaultEmotionState, createDefaultRelationshipBlock } from '@wbfm/shared/schemas';
import { EMOTION_SCHEMA_VERSION } from '@wbfm/shared/constants';

const NOW = Date.UTC(2026, 9, 12, 8, 0, 0);

function seedAssistant(db: ReturnType<typeof createDatabase>, id = 'a1'): void {
  db.prepare(
    `INSERT INTO assistants(id,name,created_at,updated_at) VALUES(?, '助手', 't', 't')`,
  ).run(id);
}

describe('emotion-state-repo（v1.6）', () => {
  it('无行时 get 返回 null、list 返回空数组', () => {
    const db = createDatabase();
    const repo = createEmotionStateRepository(db);
    expect(repo.get('missing')).toBeNull();
    expect(repo.list()).toEqual([]);
    db.close();
  });

  it('upsert 后 get/list 往返，updatedAt 列与状态毫秒时间同源', () => {
    const db = createDatabase();
    seedAssistant(db);
    const repo = createEmotionStateRepository(db);
    const state = createDefaultEmotionState(NOW);
    state.mood.happiness = 42;

    const saved = repo.upsert('a1', state);
    expect(saved.updatedAt).toBe(new Date(NOW).toISOString());

    const loaded = repo.get('a1');
    expect(loaded).not.toBeNull();
    expect(loaded?.state.mood.happiness).toBe(42);
    expect(loaded?.state.schemaVersion).toBe(EMOTION_SCHEMA_VERSION);
    expect(loaded?.state.relationship).toEqual(createDefaultRelationshipBlock());
    expect(loaded?.updatedAt).toBe(saved.updatedAt);
    expect(repo.list()).toHaveLength(1);
    db.close();
  });

  it('v2.0：v1 旧行（无 relationship 块）读侧自动迁移为 v2，补默认关系块且不改原字段', () => {
    const db = createDatabase();
    seedAssistant(db);
    const v1 = {
      schemaVersion: 1,
      mood: { happiness: 12, anger: 1, sadness: 2 },
      relation: { intimacy: 44, trust: 33 },
      currentNeed: 'none',
      counters: {},
      recentEvents: [],
      updatedAt: NOW,
    };
    db.prepare(
      `INSERT INTO assistant_emotion_states(assistant_id, state_json, updated_at)
       VALUES('a1', @json, @iso)`,
    ).run({ json: JSON.stringify(v1), iso: new Date(NOW).toISOString() });

    const loaded = createEmotionStateRepository(db).get('a1');
    expect(loaded?.state.schemaVersion).toBe(EMOTION_SCHEMA_VERSION);
    expect(loaded?.state.relationship).toEqual(createDefaultRelationshipBlock());
    expect(loaded?.state.relation).toEqual({ intimacy: 44, trust: 33 });
    expect(loaded?.state.mood.happiness).toBe(12);
    db.close();
  });

  it('重复 upsert 覆盖而非新增（每助手一行）', () => {
    const db = createDatabase();
    seedAssistant(db);
    const repo = createEmotionStateRepository(db);
    const first = createDefaultEmotionState(NOW);
    repo.upsert('a1', first);
    const second = createDefaultEmotionState(NOW + 1000);
    second.relation.intimacy = 55;
    repo.upsert('a1', second);

    expect(repo.list()).toHaveLength(1);
    expect(repo.get('a1')?.state.relation.intimacy).toBe(55);
    db.close();
  });

  it('助手不存在时外键拒绝写入', () => {
    const db = createDatabase();
    const repo = createEmotionStateRepository(db);
    expect(() => repo.upsert('ghost', createDefaultEmotionState(NOW))).toThrow();
    db.close();
  });

  it('delete 返回是否删除；随助手级联删除', () => {
    const db = createDatabase();
    seedAssistant(db);
    const repo = createEmotionStateRepository(db);
    repo.upsert('a1', createDefaultEmotionState(NOW));
    expect(repo.delete('a1')).toBe(true);
    expect(repo.delete('a1')).toBe(false);
    expect(repo.get('a1')).toBeNull();

    repo.upsert('a1', createDefaultEmotionState(NOW));
    db.prepare(`DELETE FROM assistants WHERE id='a1'`).run();
    expect(repo.get('a1')).toBeNull();
    db.close();
  });

  it('损坏 JSON 行不抛错：get 回落 null、list 跳过', () => {
    const db = createDatabase();
    seedAssistant(db);
    seedAssistant(db, 'a2');
    const repo = createEmotionStateRepository(db);
    repo.upsert('a2', createDefaultEmotionState(NOW));
    db.prepare(
      `INSERT INTO assistant_emotion_states(assistant_id, state_json, updated_at)
       VALUES('a1', 'not-json', 't')`,
    ).run();

    expect(repo.get('a1')).toBeNull();
    expect(repo.list().map((r) => r.assistantId)).toEqual(['a2']);
    db.close();
  });
});
