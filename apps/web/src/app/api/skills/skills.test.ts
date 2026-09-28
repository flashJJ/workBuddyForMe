import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { getDataDir, resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core';
import { __buildContainerForTest, __setContainerForTest, getServices } from '@/lib/server/container';
import { GET as listSkills } from './route';
import { PATCH, DELETE as removeSkill } from './[id]/route';

const jsonRequest = (body: unknown, method = 'PATCH') =>
  new Request('http://127.0.0.1/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

function writeSkill(skillsDir: string, name: string, description: string): void {
  const dir = join(skillsDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'skill.json'),
    JSON.stringify({
      name,
      description,
      promptTemplates: [{ name: 't', order: 0, content: '内容' }],
      allowedTools: ['knowledge_search'],
      permissions: ['read'],
    }),
  );
}

describe('技能管理路由（v0.6 M3）', () => {
  let db: DatabaseInstance;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-web-skills-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('GET：空列表 200；reconcile 后返回内置示例与磁盘技能视图', async () => {
    const empty = await listSkills(new Request('http://x'));
    expect(empty.status).toBe(200);
    expect((await empty.json()).data).toEqual([]);

    const skillsDir = getDataDir('skills');
    writeSkill(skillsDir, 'my-skill', '我的技能');
    getServices().skills.reconcile();

    const listed = await listSkills(new Request('http://x'));
    const data = (await listed.json()).data;
    // 内置 3 个 + 用户投放 1 个
    expect(data.map((s: { name: string }) => s.name).sort()).toEqual([
      'file-search',
      'meeting-notes',
      'my-skill',
      'weekly-report',
    ]);
    const mine = data.find((s: { name: string }) => s.name === 'my-skill');
    expect(mine).toMatchObject({
      name: 'my-skill',
      enabled: true,
      exists: true,
      error: null,
    });
    expect(mine.manifest.description).toBe('我的技能');
    expect(mine.manifest.allowedTools).toEqual(['knowledge_search']);
  });

  it('PATCH：停用/启用切换 200 并持久化；非法 body 422；不存在 404', async () => {
    writeSkill(getDataDir('skills'), 'my-skill', '我的技能');
    getServices().skills.reconcile();
    const listed = (await (await listSkills(new Request('http://x'))).json()).data;
    const target = listed.find((s: { name: string }) => s.name === 'my-skill');

    const disabled = await PATCH(jsonRequest({ enabled: false }), idParams(target.id));
    expect(disabled.status).toBe(200);
    expect((await disabled.json()).data.enabled).toBe(false);

    const relisted = (await (await listSkills(new Request('http://x'))).json()).data;
    expect(relisted.find((s: { id: string }) => s.id === target.id).enabled).toBe(false);

    const badBody = await PATCH(jsonRequest({}), idParams(target.id));
    expect(badBody.status).toBe(422);

    const missing = await PATCH(jsonRequest({ enabled: true }), idParams(crypto.randomUUID()));
    expect(missing.status).toBe(404);
  });

  it('DELETE：删除引用 200，源文件夹保留；不存在 404', async () => {
    const skillsDir = getDataDir('skills');
    writeSkill(skillsDir, 'my-skill', '我的技能');
    getServices().skills.reconcile();
    const listed = (await (await listSkills(new Request('http://x'))).json()).data;
    const target = listed.find((s: { name: string }) => s.name === 'my-skill');

    const removed = await removeSkill(new Request('http://x'), idParams(target.id));
    expect(removed.status).toBe(200);
    expect((await removed.json()).data).toEqual({ id: target.id });

    const relisted = (await (await listSkills(new Request('http://x'))).json()).data;
    expect(relisted.find((s: { id: string }) => s.id === target.id)).toBeUndefined();
    // 删除的是引用，源文件夹保留
    expect(existsSync(join(skillsDir, 'my-skill', 'skill.json'))).toBe(true);

    const missing = await removeSkill(new Request('http://x'), idParams(target.id));
    expect(missing.status).toBe(404);
  });
});
