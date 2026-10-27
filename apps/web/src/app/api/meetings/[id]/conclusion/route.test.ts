import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabase,
  createModelRepository,
  createProviderRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createSettingsService } from '@wbfm/core/services';
import { createWebCipher } from '@wbfm/core/secrets';
import { assistantCreateSchema } from '@wbfm/shared/schemas';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET, PATCH, POST } from './route';
import { POST as createActionItem } from '../action-items/route';
import { PATCH as updateActionItem } from '../action-items/[itemId]/route';

const conclusionJson = JSON.stringify({
  summary: '采用方案 A',
  decisions: ['先做后端'],
  openQuestions: [],
  actionItems: [{ content: '补测试', ownerLabel: '第二成员', ownerMemberId: null, dueAt: null }],
});

const sseBody =
  `data: ${JSON.stringify({ choices: [{ delta: { content: conclusionJson } }] })}\n\n` +
  'data: [DONE]\n\n';

const jsonRequest = (body: unknown, method = 'POST') =>
  new Request('http://127.0.0.1/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('会议结论 API（v2.6 M2）', () => {
  let db: DatabaseInstance;
  let services: ReturnType<typeof __buildContainerForTest>;
  let meetingId: string;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-conclusion-api-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    services = __buildContainerForTest(db, createWebCipher());
    const provider = createProviderRepository(db).create({
      name: 'p',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKeyCipher: '',
      enabled: true,
      sortOrder: 0,
    });
    const model = createModelRepository(db).create({
      providerId: provider.id,
      modelId: 'gpt-test',
      capabilities: ['chat'],
      contextWindow: null,
    });
    createSettingsService({ db, cipher: createWebCipher() }).update({
      defaultChatModelId: model.id,
    });
    const first = services.assistants.list()[0]!;
    const second = services.assistants.create(assistantCreateSchema.parse({ name: '第二成员' }));
    const meeting = services.meetings.create({
      topic: '评审方案',
      memberIds: [first.id, second.id],
      mode: 'manual',
    });
    services.meetings.submitTurn(meeting.id, '讨论方案 A');
    services.meetings.finish(meeting.id);
    meetingId = meeting.id;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(sseBody, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it('生成/读取/编辑结论：HTTP 200 且落库', async () => {
    const generated = await POST(new Request('http://x', { method: 'POST' }), ctx(meetingId));
    expect(generated.status).toBe(200);
    const payload = (await generated.json()).data;
    expect(payload.conclusion).toMatchObject({ summary: '采用方案 A' });
    expect(payload.actionItems).toHaveLength(1);

    const read = await GET(new Request('http://x'), ctx(meetingId));
    expect((await read.json()).data.conclusion.summary).toBe('采用方案 A');

    const patched = await PATCH(jsonRequest({ summary: '人工结论' }, 'PATCH'), ctx(meetingId));
    expect((await patched.json()).data.conclusion.summary).toBe('人工结论');
  });

  it('行动项：新增 201，状态更新 200，非法状态转移 409', async () => {
    const created = await createActionItem(
      jsonRequest({ content: '行动', ownerLabel: '', ownerMemberId: null, dueAt: null }),
      ctx(meetingId),
    );
    expect(created.status).toBe(201);
    const item = (await created.json()).data;
    expect(item).toMatchObject({ status: 'open', source: 'manual' });

    const done = await updateActionItem(
      jsonRequest({ status: 'done' }, 'PATCH'),
      { params: Promise.resolve({ id: meetingId, itemId: item.id }) },
    );
    expect(done.status).toBe(200);
    expect((await done.json()).data.status).toBe('done');

    const rejected = await updateActionItem(
      jsonRequest({ status: 'cancelled' }, 'PATCH'),
      { params: Promise.resolve({ id: meetingId, itemId: item.id }) },
    );
    expect(rejected.status).toBe(409);
  });

  it('active 会议生成结论返回 409', async () => {
    const active = services.meetings.create({
      topic: '进行中',
      memberIds: services.assistants.list().slice(0, 2).map((a) => a.id),
      mode: 'manual',
    });
    const res = await POST(new Request('http://x', { method: 'POST' }), ctx(active.id));
    expect(res.status).toBe(409);
  });
});
