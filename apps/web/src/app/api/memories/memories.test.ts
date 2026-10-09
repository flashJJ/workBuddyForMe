import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET as listMemories, POST as createMemory } from './route';
import { GET as getOne, PATCH, DELETE } from './[id]/route';
import { POST as clearAll } from './clear/route';

const jsonRequest = (body: unknown, method = 'POST') =>
  new Request('http://127.0.0.1/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe('记忆库管理路由（M4）', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-web-m4-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('空库列表 200；手工新建 201（无嵌入模型也能落库）', async () => {
    const empty = await listMemories(new Request('http://x'));
    expect((await empty.json()).data).toEqual([]);

    const created = await createMemory(
      jsonRequest({ kind: 'fact', content: '用户在准备 PMP 考试', importance: 0.8 }),
    );
    expect(created.status).toBe(201);
    const memory = (await created.json()).data;
    expect(memory).toMatchObject({
      kind: 'fact',
      content: '用户在准备 PMP 考试',
      importance: 0.8,
      status: 'active',
    });

    const listed = await listMemories(new Request('http://x?kind=fact'));
    expect((await listed.json()).data).toHaveLength(1);
  });

  it('查询校验：非法类别/非法日期 422', async () => {
    const badKind = await listMemories(new Request('http://x?kind=unknown'));
    expect(badKind.status).toBe(422);
    expect((await badKind.json()).error.code).toBe('VALIDATION_ERROR');

    const badDate = await listMemories(new Request('http://x?from=not-a-date'));
    expect(badDate.status).toBe(422);
  });

  it('新建校验：空内容/超长 importance 422', async () => {
    const empty = await createMemory(jsonRequest({ kind: 'fact', content: '' }));
    expect(empty.status).toBe(422);
    const tooImportant = await createMemory(
      jsonRequest({ kind: 'fact', content: '一条', importance: 2 }),
    );
    expect(tooImportant.status).toBe(422);
  });

  it('读取/更新/删除单条；不存在返回 404', async () => {
    const created = await createMemory(
      jsonRequest({ kind: 'preference', content: '偏好中文回复' }),
    );
    const id = (await created.json()).data.id;

    const patched = await PATCH(
      jsonRequest({ content: '偏好简体中文回复', status: 'archived' }, 'PATCH'),
      idParams(id),
    );
    expect((await patched.json()).data).toMatchObject({
      content: '偏好简体中文回复',
      status: 'archived',
    });

    const fetched = await getOne(new Request('http://x'), idParams(id));
    expect((await fetched.json()).data.status).toBe('archived');

    const removed = await DELETE(new Request('http://x', { method: 'DELETE' }), idParams(id));
    expect(removed.status).toBe(200);

    const missing = await getOne(new Request('http://x'), idParams(id));
    expect(missing.status).toBe(404);
  });

  it('清空：返回删除条数，清空后列表为空', async () => {
    await createMemory(jsonRequest({ kind: 'fact', content: '记忆一' }));
    await createMemory(jsonRequest({ kind: 'event', content: '记忆二' }));

    const result = await clearAll(jsonRequest({}));
    expect(result.status).toBe(200);
    expect((await result.json()).data).toEqual({ removed: 2 });

    const empty = await listMemories(new Request('http://x'));
    expect((await empty.json()).data).toEqual([]);
  });
});
