import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { waitForHydrated } from './utils';

/**
 * v2.6 M3 会议结论 UI 与闭环 e2e（WBFM_MOCK_AI=1）：
 * - 结束会议后生成结论（mock 确定性 JSON）→ 编辑保存 → 导出 Markdown；
 * - 行动项新增/完成/恢复、转提醒（提醒落库）、运行已发布 Flow（run 回链）。
 */

const PROVIDER_NAME = 'v26-closure-mock';
const NAMES = { a: 'v26阿策', b: 'v26阿研' } as const;
const TOPIC = 'M3 结论闭环验收';

async function api<T = unknown>(
  request: APIRequestContext,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await request.fetch(`/api${path}`, {
    method,
    data: body === undefined ? undefined : (body as object),
  });
  const payload = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: T; error?: { message: string } }
    | null;
  if (!res.ok() || payload?.success === false || payload?.error) {
    throw new Error(`${method} ${path} → HTTP ${res.status()} ${payload?.error?.message ?? ''}`);
  }
  return payload!.data as T;
}

interface Member {
  id: string;
  name: string;
}

interface Seeded {
  members: [Member, Member];
  providerId: string;
  modelId: string;
  flowId: string;
  createdProvider: boolean;
  previousDefaultModelId: string | null;
}

async function seedStack(request: APIRequestContext): Promise<Seeded> {
  const settingsBefore = await api<{ defaultChatModelId?: string | null }>(
    request,
    'GET',
    '/settings',
  );
  const providers = await api<Array<{ id: string; name: string }>>(request, 'GET', '/providers');
  const existingProvider = providers.find((p) => p.name === PROVIDER_NAME);
  const createdProvider = !existingProvider;
  const provider =
    existingProvider ??
    (await api<{ id: string }>(request, 'POST', '/providers', {
      name: PROVIDER_NAME,
      protocol: 'openai-compatible',
      baseUrl: 'http://mock.local/v1',
      apiKey: 'sk-mock',
    }));

  const models = await api<Array<{ id: string; modelId: string }>>(
    request,
    'GET',
    `/providers/${provider.id}/models`,
  );
  const model =
    models.find((m) => m.modelId === 'mock-chat') ??
    (await api<{ id: string }>(request, 'POST', `/providers/${provider.id}/models`, {
      modelId: 'mock-chat',
      capabilities: ['chat'],
    }));
  await request.put('/api/settings', { data: { defaultChatModelId: model.id } });

  const assistants = await api<Member[]>(request, 'GET', '/assistants');
  const members: Member[] = [];
  for (const name of [NAMES.a, NAMES.b]) {
    const existing = assistants.find((x) => x.name === name);
    const member =
      existing ??
      (await api<{ id: string }>(request, 'POST', '/assistants', {
        name,
        systemPrompt: `你是会议 e2e 助手 ${name}。`,
      }));
    members.push({ id: member.id, name });
  }

  const flows = await api<Array<{ id: string; name: string }>>(request, 'GET', '/flows');
  const flowName = 'v26 行动项闭环 Flow';
  let flowId = flows.find((f) => f.name === flowName)?.id;
  if (!flowId) {
    const flow = await api<{ id: string }>(request, 'POST', '/flows', { name: flowName });
    flowId = flow.id;
    await api(request, 'POST', `/flows/${flow.id}/versions`, {
      graph: {
        nodes: [
          { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
          { id: 'end', type: 'end', position: { x: 120, y: 0 }, config: { output: '完成' } },
        ],
        edges: [{ id: 'e1', source: 'start', target: 'end' }],
      },
    });
    await api(request, 'POST', `/flows/${flow.id}/publish`);
  }

  return {
    members: [members[0]!, members[1]!],
    providerId: provider.id,
    modelId: model.id,
    flowId: flowId!,
    createdProvider,
    previousDefaultModelId: settingsBefore.defaultChatModelId ?? null,
  };
}

async function cleanupStack(request: APIRequestContext, seeded: Seeded): Promise<void> {
  await api(request, 'PUT', '/settings', {
    defaultChatModelId: seeded.previousDefaultModelId,
  }).catch(() => {});
  await api(request, 'DELETE', `/flows/${seeded.flowId}`).catch(() => {});
  for (const member of seeded.members) {
    await api(request, 'DELETE', `/assistants/${member.id}`).catch(() => {});
  }
  await api(request, 'DELETE', `/models/${seeded.modelId}`).catch(() => {});
  if (seeded.createdProvider) {
    await api(request, 'DELETE', `/providers/${seeded.providerId}`).catch(() => {});
  }
}

async function openFinishedRoom(
  page: Page,
  request: APIRequestContext,
  seeded: Seeded,
): Promise<string> {
  const meeting = await api<{ id: string }>(request, 'POST', '/meetings', {
    topic: `${TOPIC} ${Date.now()}`,
    memberIds: seeded.members.map((m) => m.id),
    mode: 'manual',
  });
  await page.goto(`/meetings/${meeting.id}`);
  await waitForHydrated(page);
  await page.getByTestId('meeting-input').fill('讨论如何把会议结论转成行动项');
  await page.getByTestId('meeting-send').click();
  await page.getByTestId('meeting-finish').click();
  await expect(page.getByTestId('meeting-conclusion-panel')).toBeVisible();
  return meeting.id;
}

async function generate(page: Page): Promise<void> {
  await page.getByRole('button', { name: '生成结论' }).click();
  await expect(page.getByText('会议已形成可执行结论')).toBeVisible({ timeout: 30_000 });
}

test.describe.serial('v2.6 M3 会议结论 UI 与闭环', () => {
  let seeded: Seeded;

  test.beforeAll(async ({ request }) => {
    await request.put('/api/settings', { data: { hasOnboarded: true } });
    seeded = await seedStack(request);
  });

  test.afterAll(async ({ request }) => {
    await cleanupStack(request, seeded);
  });

  test('生成结论 → 编辑保存 → 导出 Markdown', async ({ page, request }) => {
    const meetingId = await openFinishedRoom(page, request, seeded);
    await generate(page);

    await expect(page.getByText('先完成结论闭环')).toBeVisible();
    await expect(page.getByText('跟进结论落地')).toBeVisible();

    await page.getByRole('button', { name: '编辑', exact: true }).click();
    const summary = page.getByLabel('摘要');
    await summary.fill('人工验收结论');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('人工验收结论')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出 Markdown' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`meeting-${meetingId}.md`);
    const markdown = readFileSync((await download.path())!, 'utf8');
    expect(markdown).toContain(`# ${TOPIC} `);
    expect(markdown).toContain('人工验收结论');
    expect(markdown).toContain('跟进结论落地');
  });

  test('行动项：新增/完成/恢复、转提醒落库、运行已发布 Flow 回链', async ({ page, request }) => {
    const meetingId = await openFinishedRoom(page, request, seeded);
    await generate(page);

    await page.getByRole('button', { name: '添加行动项' }).click();
    await page.getByLabel('要跟进什么？').fill('跟进导出测试');
    await page.getByLabel('截止时间').fill('2099-11-01T09:30');
    await page.getByRole('button', { name: '添加', exact: true }).click();

    const row = page.getByTestId('meeting-action-item').filter({ hasText: '跟进导出测试' });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: '标记完成' }).click();
    await expect(row).toHaveAttribute('data-status', 'done');
    await expect(row.getByText('已完成')).toBeVisible();
    await row.getByRole('button', { name: '恢复待办' }).click();
    await expect(row).toHaveAttribute('data-status', 'open');

    await row.getByRole('button', { name: '转提醒' }).click();
    const reminderDialog = page.getByRole('dialog');
    await expect(reminderDialog).toContainText('转为提醒？');
    await reminderDialog.getByRole('button', { name: '转提醒' }).click();
    await expect(row.getByText(/已转提醒/)).toBeVisible();

    const reminders = await api<Array<{ text: string }>>(
      request,
      'GET',
      `/schedules?assistantId=${seeded.members[0]!.id}`,
    );
    expect(reminders.some((item) => item.text === '跟进导出测试')).toBe(true);

    await expect(page.getByRole('dialog')).toBeHidden();
    await row.getByRole('button', { name: '运行 Flow' }).click();
    const flowDialog = page.getByRole('dialog');
    await expect(flowDialog).toContainText('选择要运行的 Flow');
    await flowDialog.getByRole('button', { name: '运行 Flow' }).click();
    await expect(row.getByText(/已运行 Flow/)).toBeVisible();

    const view = await api<{
      actionItems: Array<{
        content: string;
        linkedReminderId: string | null;
        linkedFlowRunId: string | null;
      }>;
    }>(request, 'GET', `/meetings/${meetingId}/conclusion`);
    const item = view.actionItems.find((x) => x.content === '跟进导出测试');
    expect(item?.linkedReminderId).toBeTruthy();
    expect(item?.linkedFlowRunId).toBeTruthy();
  });
});
