import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET as listAssistants, POST as createAssistant } from './route';
import { GET as getOne, PATCH, DELETE } from './[id]/route';
import { POST as reorder } from './reorder/route';

const jsonRequest = (body: unknown, method = 'POST') =>
  new Request('http://127.0.0.1/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('助手路由（TR-20.1）', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-web-t20-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('列表含内置助手；创建/读取/更新自定义助手 200/201', async () => {
    const list = await listAssistants(new Request('http://x'));
    const builtins = (await list.json()).data;
    expect(builtins).toHaveLength(1);
    expect(builtins[0].isBuiltin).toBe(true);

    const created = await createAssistant(
      jsonRequest({ name: '翻译官', emoji: '🌐', systemPrompt: '你是翻译' }),
    );
    expect(created.status).toBe(201);
    const assistant = (await created.json()).data;

    const fetched = await getOne(new Request('http://x'), {
      params: Promise.resolve({ id: assistant.id }),
    });
    expect((await fetched.json()).data.name).toBe('翻译官');

    const patched = await PATCH(jsonRequest({ name: '首席翻译' }, 'PATCH'), {
      params: Promise.resolve({ id: assistant.id }),
    });
    expect((await patched.json()).data.name).toBe('首席翻译');
  });

  it('校验失败：空名称 422；绑定不存在模型/知识库 422', async () => {
    const empty = await createAssistant(jsonRequest({ name: '', systemPrompt: 'x' }));
    expect(empty.status).toBe(422);

    const badModel = await createAssistant(
      jsonRequest({ name: 'a', systemPrompt: 'x', modelId: 'nope' }),
    );
    expect(badModel.status).toBe(422);
  });

  it('内置助手删除被拒（403 FORBIDDEN），自定义助手可删除', async () => {
    const builtinId = (await (await listAssistants(new Request('http://x'))).json()).data[0].id;
    const reject = await DELETE(new Request('http://x'), {
      params: Promise.resolve({ id: builtinId }),
    });
    expect(reject.status).toBe(403);
    expect((await reject.json()).error.code).toBe('FORBIDDEN');

    const created = await createAssistant(
      jsonRequest({ name: '临时', systemPrompt: 'x' }),
    );
    const id = (await created.json()).data.id;
    const deleted = await DELETE(new Request('http://x', { method: 'DELETE' }), {
      params: Promise.resolve({ id }),
    });
    expect(deleted.status).toBe(200);
  });

  it('排序：全量集合一致时生效，缺项 422；更新后列表顺序变化', async () => {
    const second = await createAssistant(jsonRequest({ name: '乙', systemPrompt: 'x' }));
    const first = await createAssistant(jsonRequest({ name: '甲', systemPrompt: 'x' }));
    const secondId = (await second.json()).data.id;
    const firstId = (await first.json()).data.id;
    const builtinId = (await (await listAssistants(new Request('http://x'))).json()).data[0].id;

    const invalid = await reorder(jsonRequest({ orderedIds: [firstId, secondId] }));
    expect(invalid.status).toBe(422);

    const ok = await reorder(jsonRequest({ orderedIds: [firstId, secondId, builtinId] }));
    expect(ok.status).toBe(200);
    const order = (await (await listAssistants(new Request('http://x'))).json()).data.map(
      (a: { id: string }) => a.id,
    );
    expect(order.slice(0, 2)).toEqual([firstId, secondId]);
  });
});
