import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createMeetingConclusionRepository,
  createModelRepository,
  createProviderRepository,
  createWorkflowRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createSettingsService } from '@wbfm/core/services';
import { createWebCipher } from '@wbfm/core/secrets';
import { assistantCreateSchema, type FlowGraph } from '@wbfm/shared/schemas';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { POST as toReminder } from './action-items/[itemId]/to-reminder/route';
import { POST as runFlow } from './action-items/[itemId]/run-flow/route';
import { GET as exportMarkdown } from './export/route';

const jsonRequest = (body: unknown) =>
  new Request('http://127.0.0.1/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const startEndGraph: FlowGraph = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
    { id: 'end', type: 'end', position: { x: 100, y: 0 }, config: { output: '完成' } },
  ],
  edges: [{ id: 'e1', source: 'start', target: 'end' }],
};

describe('会议行动项闭环 API（v2.6 M3）', () => {
  let db: DatabaseInstance;
  let services: ReturnType<typeof __buildContainerForTest>;
  let meetingId: string;
  let memberId: string;
  let itemId: string;
  let conclusions: ReturnType<typeof createMeetingConclusionRepository>;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-closure-api-'));
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
    memberId = second.id;
    const meeting = services.meetings.create({
      topic: '评审方案',
      memberIds: [first.id, second.id],
      mode: 'manual',
    });
    services.meetings.finish(meeting.id);
    meetingId = meeting.id;
    conclusions = createMeetingConclusionRepository(db);
    itemId = conclusions.createActionItem(meetingId, {
      content: '补充测试',
      ownerLabel: '第二成员',
      ownerMemberId: memberId,
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    }).id;
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  const ctx = (item: string) => ({ params: Promise.resolve({ id: meetingId, itemId: item }) });

  it('转提醒：创建提醒并回链；重复转换 409', async () => {
    const res = await toReminder(
      jsonRequest({ assistantId: memberId }),
      ctx(itemId),
    );
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.reminder).toMatchObject({
      assistantId: memberId,
      kind: 'once',
      timezone: 'Asia/Shanghai',
      text: '补充测试',
    });
    expect(data.actionItem.linkedReminderId).toBe(data.reminder.id);

    const again = await toReminder(jsonRequest({ assistantId: memberId }), ctx(itemId));
    expect(again.status).toBe(409);
  });

  it('转提醒：无截止时间返回 422', async () => {
    const noDue = conclusions.createActionItem(meetingId, {
      content: '无截止',
      ownerLabel: '',
      ownerMemberId: null,
      dueAt: null,
    });
    const res = await toReminder(jsonRequest({ assistantId: memberId }), ctx(noDue.id));
    expect(res.status).toBe(422);
  });

  it('运行 Flow：已发布 Flow 创建运行并回链；重复运行 409', async () => {
    const repo = createWorkflowRepository(db);
    const workflow = repo.createWorkflow({ name: '行动项跟进' });
    repo.addVersion(workflow.id, startEndGraph);
    repo.publishVersion(workflow.id);

    const res = await runFlow(jsonRequest({ workflowId: workflow.id }), ctx(itemId));
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.workflowId).toBe(workflow.id);
    expect(data.actionItem.linkedFlowRunId).toBe(data.runId);
    await services.flowRunner.waitForTerminal(data.runId, 5_000);

    const again = await runFlow(jsonRequest({ workflowId: workflow.id }), ctx(itemId));
    expect(again.status).toBe(409);
  });

  it('运行 Flow：草稿 Flow 返回 422', async () => {
    const repo = createWorkflowRepository(db);
    const draft = repo.createWorkflow({ name: '草稿 Flow' });
    repo.addVersion(draft.id, startEndGraph);
    const res = await runFlow(jsonRequest({ workflowId: draft.id }), ctx(itemId));
    expect(res.status).toBe(422);
  });

  it('导出 Markdown：附件名、content-type 与英文标签', async () => {
    const res = await exportMarkdown(
      new Request(`http://x/api/meetings/${meetingId}/export?format=markdown&locale=en`),
      { params: Promise.resolve({ id: meetingId }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    expect(res.headers.get('content-disposition')).toContain(`meeting-${meetingId}.md`);
    const text = await res.text();
    expect(text).toContain('# 评审方案');
    expect(text).toContain('## Action items');
    expect(text).toContain('- [ ] 补充测试');

    const zh = await exportMarkdown(
      new Request(`http://x/api/meetings/${meetingId}/export?locale=zh`),
      { params: Promise.resolve({ id: meetingId }) },
    );
    const zhText = await zh.text();
    expect(zhText).toContain('## 会议结论');
    expect(zhText).toContain('## 行动项');
    expect(zhText).toContain('状态: 已结束');
  });
});
