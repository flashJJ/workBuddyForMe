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
import { __buildContainerForTest, __setContainerForTest, type ServiceContainer } from '@/lib/server/container';
import { GET as listSchedules, POST as createSchedule } from './route';
import { PATCH as patchSchedule } from './[id]/route';
import { GET as listDue } from './due/route';
import { runServerSchedulerTick } from '@/lib/server/server-scheduler';

const jsonRequest = (body: unknown, method = 'POST') =>
  new Request('http://127.0.0.1/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const agentPayload = (overrides: Record<string, unknown> = {}) => ({
  kind: 'agent_task',
  goal: '整理下载目录',
  conversationId: '',
  permissionMode: 'confirm_each',
  notify: 'work_signal',
  ...overrides,
});

describe('定时 Agent API（v2.13 M4）', () => {
  let db: DatabaseInstance;
  let services: ServiceContainer;
  let conversationId: string;
  let assistantId: string;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-schedule-agent-')));
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
      modelId: 'vision-test',
      capabilities: ['chat', 'vision'],
      contextWindow: null,
    });
    createSettingsService({ db, cipher: createWebCipher() }).update({
      defaultChatModelId: model.id,
    });
    assistantId = services.assistants.list()[0]!.id;
    conversationId = services.conversations.create(assistantId, '定时任务会话').id;
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('创建 agent_task：payload 落库并可回读', async () => {
    const res = await createSchedule(
      jsonRequest({
        assistantId,
        kind: 'daily',
        hour: 9,
        minute: 0,
        timezone: 'Asia/Shanghai',
        text: '每天整理下载目录',
        payload: agentPayload({ conversationId }),
      }),
    );
    expect(res.status).toBe(201);
    const data = (await res.json()).data;
    expect(data.payload).toMatchObject({
      kind: 'agent_task',
      conversationId,
      permissionMode: 'confirm_each',
      notify: 'work_signal',
    });

    const list = await listSchedules(new Request('http://127.0.0.1/x'));
    const items = (await list.json()).data as Array<{ payload: { kind: string } }>;
    expect(items[0]!.payload.kind).toBe('agent_task');
  });

  it('full_access 不被无人值守允许：422 UNATTENDED_MODE_NOT_ALLOWED', async () => {
    const res = await createSchedule(
      jsonRequest({
        assistantId,
        kind: 'once',
        hour: 9,
        minute: 0,
        atDate: '2026-11-01',
        timezone: 'Asia/Shanghai',
        text: '完全放行',
        payload: agentPayload({ conversationId, permissionMode: 'full_access' }),
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details).toMatchObject({ code: 'UNATTENDED_MODE_NOT_ALLOWED' });
  });

  it('工作目录不存在：创建被拒', async () => {
    const res = await createSchedule(
      jsonRequest({
        assistantId,
        kind: 'daily',
        hour: 9,
        minute: 0,
        timezone: 'Asia/Shanghai',
        text: '坏目录',
        payload: agentPayload({ conversationId, workspacePath: join(tmpdir(), 'wbfm-missing-dir') }),
      }),
    );
    expect(res.status).toBe(422);
  });

  it('已创建任务不允许切换 payload 类型', async () => {
    const created = await createSchedule(
      jsonRequest({
        assistantId,
        kind: 'daily',
        hour: 9,
        minute: 0,
        timezone: 'Asia/Shanghai',
        text: '普通提醒',
        payload: { kind: 'follow_up', conversationId },
      }),
    );
    const id = (await created.json()).data.id as string;
    const patch = await patchSchedule(jsonRequest({ payload: agentPayload({ conversationId }) }, 'PATCH'), {
      params: Promise.resolve({ id }),
    });
    expect(patch.status).toBe(422);
    const body = await patch.json();
    expect(body.error.details).toMatchObject({ code: 'SCHEDULE_PAYLOAD_KIND_IMMUTABLE' });
  });

  it('渲染进程 /due 不返回 agent_task', async () => {
    const agentRes = await createSchedule(
      jsonRequest({
        assistantId,
        kind: 'daily',
        hour: 9,
        minute: 0,
        timezone: 'Asia/Shanghai',
        text: 'Agent 任务',
        payload: agentPayload({ conversationId }),
      }),
    );
    const agentId = (await agentRes.json()).data.id as string;
    const reminderRes = await createSchedule(
      jsonRequest({
        assistantId,
        kind: 'daily',
        hour: 9,
        minute: 0,
        timezone: 'Asia/Shanghai',
        text: '普通提醒',
      }),
    );
    const reminderId = (await reminderRes.json()).data.id as string;
    const past = '2000-01-01T00:00:00.000Z';
    db.prepare('UPDATE scheduled_tasks SET next_run_at = ? WHERE id IN (?, ?)').run(
      past,
      agentId,
      reminderId,
    );

    const due = await listDue(new Request('http://127.0.0.1/x'));
    const items = (await due.json()).data as Array<{ id: string }>;
    expect(items.map((item) => item.id)).toEqual([reminderId]);
  });

  it('服务端 tick 标记到点的 agent_task；模式失配时写 unattended_blocked', async () => {
    const created = await createSchedule(
      jsonRequest({
        assistantId,
        kind: 'once',
        hour: 9,
        minute: 0,
        atDate: '2026-11-01',
        timezone: 'Asia/Shanghai',
        text: '无人值守任务',
        payload: agentPayload({ conversationId }),
      }),
    );
    const id = (await created.json()).data.id as string;
    db.prepare('UPDATE scheduled_tasks SET next_run_at = ? WHERE id = ?').run(
      '2000-01-01T00:00:00.000Z',
      id,
    );
    // 创建后收紧白名单：运行时应再次校验并拒绝
    const policy = services.settings.get().agentPolicy!;
    services.settings.update({
      agentPolicy: { ...policy, unattended: { ...policy.unattended, allowedModes: ['plan_only'] } },
    });

    const delivered = await runServerSchedulerTick(services);
    expect(delivered).toBe(1);
    const task = services.schedules.get(id);
    expect(task.lastFiredAt).not.toBeNull();
    const blocked = services.audit
      .list({ kind: 'unattended_blocked', limit: 10 })
      .events.find((event) => event.reasonCode === 'UNATTENDED_MODE_NOT_ALLOWED');
    expect(blocked).toBeTruthy();
  });
});
