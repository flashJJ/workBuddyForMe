import { describe, expect, it } from 'vitest';
import { createDatabase } from '../client';
import { createSkillStateRepository } from './skill-state-repo';

describe('skill-state-repo（v0.6 M3）', () => {
  it('create/list/get/getByName 往返', () => {
    const db = createDatabase();
    const repo = createSkillStateRepository(db);
    const created = repo.create({ name: 'weekly-report', sourcePath: '/data/skills/weekly-report' });
    expect(created.id).toBeTruthy();
    expect(created.enabled).toBe(true);
    expect(created.sourcePath).toBe('/data/skills/weekly-report');

    expect(repo.list()).toHaveLength(1);
    expect(repo.get(created.id)?.name).toBe('weekly-report');
    expect(repo.getByName('weekly-report')?.id).toBe(created.id);
    expect(repo.getByName('nope')).toBeNull();
    db.close();
  });

  it('name 唯一约束：重名创建抛错', () => {
    const db = createDatabase();
    const repo = createSkillStateRepository(db);
    repo.create({ name: 'weekly-report' });
    expect(() => repo.create({ name: 'weekly-report' })).toThrow();
    db.close();
  });

  it('update 部分更新并刷新 updated_at；remove 返回是否删除', () => {
    const db = createDatabase();
    const repo = createSkillStateRepository(db);
    const created = repo.create({ name: 'meeting-notes', sourcePath: '/old/path' });

    const updated = repo.update(created.id, { enabled: false, sourcePath: '/new/path' });
    expect(updated?.enabled).toBe(false);
    expect(updated?.sourcePath).toBe('/new/path');
    expect((updated?.updatedAt ?? '') >= created.updatedAt).toBe(true);

    expect(repo.update('missing', { enabled: true })).toBeNull();

    expect(repo.remove(created.id)).toBe(true);
    expect(repo.remove(created.id)).toBe(false);
    expect(repo.get(created.id)).toBeNull();
    db.close();
  });

  it('removeByName 按名称删除引用', () => {
    const db = createDatabase();
    const repo = createSkillStateRepository(db);
    repo.create({ name: 'weekly-report' });
    expect(repo.removeByName('weekly-report')).toBe(true);
    expect(repo.removeByName('weekly-report')).toBe(false);
    expect(repo.list()).toHaveLength(0);
    db.close();
  });
});
