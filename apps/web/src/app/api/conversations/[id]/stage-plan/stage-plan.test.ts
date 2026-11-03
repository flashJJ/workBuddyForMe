import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { BUILTIN_ASSISTANT } from '@wbfm/core/services';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET, PUT } from './route';
import { POST as PREPARE } from './prepare/route';

const jsonRequest = (method: string, body: unknown) =>
  new Request('http://127.0.0.1/x', {
    method,
    ...(method === 'GET'
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const PLAN = {
  steps: [
    {
      title: '调研',
      modelId: null,
      skillNames: [],
      goal: '整理竞品',
      deliverables: '对比表',
    },
  ],
  activeStep: 0,
};

describe('v2.20 阶段计划 API', () => {
  let db: DatabaseInstance;
  let conversationId: string;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-web-stage-')));
    db = createDatabase(':memory:');
    const services = __buildContainerForTest(db, createWebCipher());
    conversationId = services.conversations.create(BUILTIN_ASSISTANT.id, '阶段会话').id;
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('GET 无计划返回 null；PUT 后回读；prepare 返回任务文本', async () => {
    const empty = await GET(jsonRequest('GET', {}), params(conversationId));
    expect(empty.status).toBe(200);
    expect((await empty.json()).data.plan).toBeNull();

    const saved = await PUT(jsonRequest('PUT', PLAN), params(conversationId));
    expect(saved.status).toBe(200);
    const savedBody = (await saved.json()).data;
    expect(savedBody.plan.steps[0].title).toBe('调研');
    expect(savedBody.modelId).toBeNull();

    const readBack = await GET(jsonRequest('GET', {}), params(conversationId));
    expect((await readBack.json()).data.plan.activeStep).toBe(0);

    const prepared = await PREPARE(
      jsonRequest('POST', { stepIndex: 0 }),
      params(conversationId),
    );
    expect(prepared.status).toBe(200);
    expect((await prepared.json()).data.taskText).toContain('整理竞品');
  });

  it('非法计划 422；会话不存在 404；prepare 越界 422', async () => {
    const bad = await PUT(
      jsonRequest('PUT', {
        steps: Array.from({ length: 9 }, (_, i) => ({ ...PLAN.steps[0], title: `阶段${i}` })),
        activeStep: null,
      }),
      params(conversationId),
    );
    expect(bad.status).toBe(422);

    const missing = await GET(jsonRequest('GET', {}), params('missing'));
    expect(missing.status).toBe(404);

    await PUT(jsonRequest('PUT', PLAN), params(conversationId));
    const outOfRange = await PREPARE(
      jsonRequest('POST', { stepIndex: 5 }),
      params(conversationId),
    );
    expect(outOfRange.status).toBe(422);
  });
});
