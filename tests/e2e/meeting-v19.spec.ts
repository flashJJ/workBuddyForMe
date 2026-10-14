import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { waitForHydrated } from './utils';

/**
 * v1.9 M3 多助手会议 e2e（WBFM_MOCK_AI=1）：
 * - manual：UI 发起会议；无 @ 只存用户消息不调模型；@ 两人按书写顺序串行发言；
 * - all：全员按席次各一轮，结束自动收回 manual；
 * - auto：[meeting-chain:名1>名2>名3] 驱动 mock 确定性接龙，轮次计数，结束回 manual；
 *   舞台 ?meeting= 只读回放 3 席 cast 与末位台词；
 * - 打断：长回答流式中 abort，会议收敛 aborted，终态控件禁用（单请求单 abort）。
 * 归属/越权等纯协议反向 eval 在 core 单测覆盖，本文件只断产品链路。
 */

const PROVIDER_NAME = 'v19-meeting-mock';
const NAMES = { a: 'v19阿策', b: 'v19阿研', c: 'v19阿审' } as const;

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
  members: [Member, Member, Member];
  providerId: string;
  modelId: string;
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
  for (const name of [NAMES.a, NAMES.b, NAMES.c]) {
    const existing = assistants.find((x) => x.name === name);
    const member =
      existing ??
      (await api<{ id: string }>(request, 'POST', '/assistants', {
        name,
        systemPrompt: `你是会议 e2e 助手 ${name}。`,
      }));
    members.push({ id: member.id, name });
  }

  return {
    members: [members[0]!, members[1]!, members[2]!],
    providerId: provider.id,
    modelId: model.id,
    createdProvider,
    previousDefaultModelId: settingsBefore.defaultChatModelId ?? null,
  };
}

async function cleanupStack(request: APIRequestContext, seeded: Seeded): Promise<void> {
  // 先还原默认模型指针，再删助手/模型/供应商（顺序不可颠倒，避免后续 spec 无可用对话模型）
  await api(request, 'PUT', '/settings', {
    defaultChatModelId: seeded.previousDefaultModelId,
  }).catch(() => {});
  for (const member of seeded.members) {
    await api(request, 'DELETE', `/assistants/${member.id}`).catch(() => {});
  }
  await api(request, 'DELETE', `/models/${seeded.modelId}`).catch(() => {});
  if (seeded.createdProvider) {
    await api(request, 'DELETE', `/providers/${seeded.providerId}`).catch(() => {});
  }
}

interface MeetingDetail {
  meeting: { id: string; status: string; mode: string; autoRounds: number };
  messages: Array<{ id: string; seq: number; speakerKind: string; speakerId: string | null }>;
}

const getDetail = (request: APIRequestContext, id: string) =>
  api<MeetingDetail>(request, 'GET', `/meetings/${id}`);

/** 轮询直到助手发言条数达标或超时 */
async function waitAssistantCount(
  request: APIRequestContext,
  id: string,
  count: number,
): Promise<MeetingDetail> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const detail = await getDetail(request, id);
    if (detail.messages.filter((m) => m.speakerKind === 'assistant').length >= count) return detail;
    if (Date.now() > deadline) throw new Error(`会议 ${id} 助手发言未达 ${count} 条`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function openRoom(page: Page, id: string): Promise<void> {
  await page.goto(`/meetings/${id}`);
  await waitForHydrated(page);
  await expect(page.getByTestId('meeting-status-badge')).toBeVisible();
}

test.describe.serial('v1.9 M3 多助手会议（manual/all/auto + 打断 + 舞台回放）', () => {
  let seeded: Seeded;

  test.beforeAll(async ({ request }) => {
    await request.put('/api/settings', { data: { hasOnboarded: true } });
    seeded = await seedStack(request);
  });

  test.afterAll(async ({ request }) => {
    await cleanupStack(request, seeded);
  });

  test('manual：UI 发起会议；无 @ 不触发模型；@ 两人按顺序串行；列表可见', async ({
    page,
    request,
  }) => {
    await page.goto('/meetings');
    await waitForHydrated(page);
    await page.getByTestId('meeting-topic').fill('M3 手动点名评审');
    await page.click(`[data-member-id="${seeded.members[0]!.id}"]`);
    await page.click(`[data-member-id="${seeded.members[1]!.id}"]`);
    await page.getByTestId('meeting-submit').click();
    await page.waitForURL(/\/meetings\/[a-zA-Z0-9_-]+$/);
    const meetingId = new URL(page.url()).pathname.split('/').pop()!;

    // 无 @：仅存用户消息，零模型调用
    await page.getByTestId('meeting-input').fill('大家先安静听完');
    await page.getByTestId('meeting-send').click();
    await expect
      .poll(async () => (await getDetail(request, meetingId)).messages.length, { timeout: 5_000 })
      .toBe(1);
    expect(
      (await getDetail(request, meetingId)).messages.every((m) => m.speakerKind === 'user'),
    ).toBe(true);

    // @ 两人：按书写顺序串行
    await page.getByTestId('meeting-input').fill(`@${NAMES.a} @${NAMES.b} 请依次发言`);
    await page.getByTestId('meeting-send').click();
    const detail = await waitAssistantCount(request, meetingId, 2);
    expect(detail.messages.filter((m) => m.speakerKind === 'assistant').map((m) => m.speakerId)).toEqual([
      seeded.members[0]!.id,
      seeded.members[1]!.id,
    ]);

    // 会场转录展示两位署名
    const transcript = page.getByTestId('meeting-transcript');
    await expect(transcript).toContainText(NAMES.a);
    await expect(transcript).toContainText(NAMES.b);

    // 列表页可见本场会议
    await page.goto('/meetings');
    await waitForHydrated(page);
    await expect(page.locator(`[data-meeting-id="${meetingId}"]`)).toBeVisible();
  });

  test('all：全员按席次各一轮，结束自动收回 manual', async ({ page, request }) => {
    const meeting = await api<{ id: string }>(request, 'POST', '/meetings', {
      topic: 'M3 每人一轮',
      memberIds: seeded.members.map((m) => m.id),
      mode: 'all',
    });
    await openRoom(page, meeting.id);

    await page.getByTestId('meeting-input').fill('请每人一轮发表观点');
    await page.getByTestId('meeting-send').click();

    const detail = await waitAssistantCount(request, meeting.id, 3);
    expect(detail.messages.filter((m) => m.speakerKind === 'assistant').map((m) => m.speakerId)).toEqual(
      seeded.members.map((m) => m.id),
    );
    await expect
      .poll(async () => (await getDetail(request, meeting.id)).meeting.mode, { timeout: 10_000 })
      .toBe('manual');
    await expect(page.getByTestId('meeting-mode-manual')).toHaveAttribute('data-active', 'true');
  });

  test('auto：名单接龙 a→b→c（3 轮硬计数），结束回 manual；舞台只读回放三席与末位台词', async ({
    page,
    request,
  }) => {
    const meeting = await api<{ id: string }>(request, 'POST', '/meetings', {
      topic: 'M3 自由接龙',
      memberIds: seeded.members.map((m) => m.id),
      mode: 'auto',
    });
    await openRoom(page, meeting.id);

    await page
      .getByTestId('meeting-input')
      .fill(`接龙讨论 [meeting-chain:${NAMES.a}>${NAMES.b}>${NAMES.c}]`);
    await page.getByTestId('meeting-send').click();

    const detail = await waitAssistantCount(request, meeting.id, 3);
    expect(detail.messages.filter((m) => m.speakerKind === 'assistant').map((m) => m.speakerId)).toEqual(
      seeded.members.map((m) => m.id),
    );
    const settled = await getDetail(request, meeting.id);
    expect(settled.meeting.autoRounds).toBe(3);
    expect(settled.meeting.mode).toBe('manual');

    // 舞台只读回放：三席按席次就位，末位（阿审）台词挂住，零会议控制件
    await page.goto(`/stage?meeting=${encodeURIComponent(meeting.id)}`);
    await waitForHydrated(page);
    await expect(page.getByTestId('stage-root')).toHaveAttribute('data-mode', 'meeting');
    await expect(page.getByTestId('stage-meeting-status')).toHaveAttribute(
      'data-state',
      'active',
    );
    await expect(page.getByTestId('stage-nameplate-left')).toContainText(NAMES.a);
    await expect(page.getByTestId('stage-nameplate-center')).toContainText(NAMES.b);
    await expect(page.getByTestId('stage-nameplate-right')).toContainText(NAMES.c);
    await expect(page.getByTestId('stage-dialog')).toContainText(NAMES.c);
    await expect(page.getByTestId('meeting-abort')).toHaveCount(0);
  });

  test('打断：长回答流式中 abort，会议收敛 aborted，终态输入/发送禁用', async ({
    page,
    request,
  }) => {
    const meeting = await api<{ id: string }>(request, 'POST', '/meetings', {
      topic: 'M3 打断验证',
      memberIds: seeded.members.slice(0, 2).map((m) => m.id),
      mode: 'manual',
    });
    await openRoom(page, meeting.id);

    await page.getByTestId('meeting-input').fill(`@${NAMES.a} 请详细说说这个方案`);
    await page.getByTestId('meeting-send').click();
    await expect(page.getByTestId('meeting-speaking')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('meeting-abort').click();
    await expect(page.getByTestId('meeting-status-badge')).toHaveAttribute(
      'data-status',
      'aborted',
      { timeout: 10_000 },
    );
    await expect
      .poll(async () => (await getDetail(request, meeting.id)).meeting.status, { timeout: 10_000 })
      .toBe('aborted');
    await expect(page.getByTestId('meeting-input')).toBeDisabled();
    await expect(page.getByTestId('meeting-send')).toBeDisabled();
    await expect(page.getByTestId('meeting-abort')).toBeDisabled();
  });
});
