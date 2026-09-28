import { describe, expect, it } from 'vitest';
import { createDatabase } from '../client';
import { createMcpServerRepository } from './mcp-server-repo';

describe('mcp-server-repo（v0.6）', () => {
  it('create/list/get 往返：stdio 字段落库与 JSON 解析', () => {
    const db = createDatabase();
    const repo = createMcpServerRepository(db);
    const created = repo.create({
      transport: 'stdio',
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', 'D:/docs'],
      env: { DEBUG: 'mcp*' },
    });
    expect(created.id).toBeTruthy();
    expect(created.enabled).toBe(true);
    expect(created.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', 'D:/docs']);
    expect(created.env).toEqual({ DEBUG: 'mcp*' });
    expect(created.url).toBe('');

    expect(repo.list()).toHaveLength(1);
    expect(repo.get(created.id)?.name).toBe('filesystem');
    expect(repo.getByName('filesystem')?.id).toBe(created.id);
    expect(repo.getByName('nope')).toBeNull();
    db.close();
  });

  it('name 唯一约束：重名创建抛错', () => {
    const db = createDatabase();
    const repo = createMcpServerRepository(db);
    repo.create({ transport: 'stdio', name: 'fs', command: 'a' });
    expect(() => repo.create({ transport: 'stdio', name: 'fs', command: 'b' })).toThrow();
    db.close();
  });

  it('update 部分更新并刷新 updated_at；remove 返回是否删除', () => {
    const db = createDatabase();
    const repo = createMcpServerRepository(db);
    const created = repo.create({ transport: 'stdio', name: 'fs', command: 'a', args: ['x'] });

    const updated = repo.update(created.id, { enabled: false, command: 'node' });
    expect(updated?.enabled).toBe(false);
    expect(updated?.command).toBe('node');
    // 未更新字段保持原值
    expect(updated?.args).toEqual(['x']);
    expect((updated?.updatedAt ?? '') >= created.updatedAt).toBe(true);

    // 未知 id 返回 null
    expect(repo.update('missing', { enabled: true })).toBeNull();

    expect(repo.remove(created.id)).toBe(true);
    expect(repo.remove(created.id)).toBe(false);
    expect(repo.get(created.id)).toBeNull();
    db.close();
  });

  it('损坏的 JSON 列容错解析为空值', () => {
    const db = createDatabase();
    const repo = createMcpServerRepository(db);
    const created = repo.create({ transport: 'stdio', name: 'fs', command: 'a' });
    db.prepare(`UPDATE mcp_servers SET args='{broken', env='[1,2]' WHERE id=?`).run(created.id);
    const parsed = repo.get(created.id);
    expect(parsed?.args).toEqual([]);
    expect(parsed?.env).toEqual({});
    db.close();
  });
});
