import { createHash } from 'node:crypto';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { waitForHydrated } from './utils';

/**
 * v2.14 可维护运维链路 e2e（契约 §10 五类）：
 * ① 技能升级后回退；② 工作流草稿不影响生产运行；③ 能力包降级确认与反向依赖拒绝；
 * ④ 审计 / 审批 → 时间线；⑤ 诊断包不含哨兵密钥与绝对路径。
 */

type Envelope<T> = { data?: T };

const PROVIDER_NAME = 'v214-ops-mock';
const ASSISTANT_NAME = 'v2.14 运维助手';
const SENTINEL_KEY = 'sk-SENTINEL-v214-do-not-leak';

async function onboard(page: Page): Promise<void> {
  await page.request.put('/api/settings', { data: { hasOnboarded: true } });
}

async function skipOnboardingIfShown(page: Page): Promise<void> {
  const wizard = page.getByRole('dialog', { name: '首次使用向导' });
  try {
    await wizard.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    return;
  }
  await page.getByRole('button', { name: '跳过' }).click();
  await expect(wizard).toBeHidden();
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

interface SkillPackInput {
  id: string;
  skillName: string;
  version: string;
  description: string;
  content?: string;
  dependencies?: Array<{ id: string; version: string }>;
}

/** 构造技能能力包 ZIP（外清单 + payload/skill.json） */
function skillPack(input: SkillPackInput): Buffer {
  const skill = {
    name: input.skillName,
    description: input.description,
    version: input.version,
    permissions: ['read'],
    promptTemplates: [
      { name: 'note', order: 0, content: input.content ?? `v${input.version} 内容` },
    ],
    allowedTools: [],
  };
  const payload = strToU8(JSON.stringify(skill, null, 2));
  const manifest = {
    id: input.id,
    version: input.version,
    kind: 'skill',
    name: `${input.skillName} 包`,
    description: input.description,
    permissions: ['skill:install'],
    entry: 'payload/skill.json',
    dependencies: input.dependencies ?? [],
    checksums: { 'payload/skill.json': sha256(payload) },
  };
  return Buffer.from(
    zipSync({
      'wbfm-capability.json': strToU8(JSON.stringify(manifest, null, 2)),
      'payload/skill.json': payload,
    }),
  );
}

async function installPack(
  request: APIRequestContext,
  pack: Buffer,
): Promise<{ id: string; version: string }> {
  const res = await request.post('/api/capabilities/install', {
    multipart: { file: { name: 'pack.zip', mimeType: 'application/zip', buffer: pack } },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as Envelope<{ id: string; version: string }>).data!;
}

async function upgradePack(
  request: APIRequestContext,
  id: string,
  pack: Buffer,
  options: { confirmDowngrade?: boolean; expectedVersion?: string; repair?: boolean } = {},
) {
  const fields: Record<string, string> = {};
  if (options.confirmDowngrade) fields.confirmDowngrade = 'true';
  if (options.expectedVersion) fields.expectedVersion = options.expectedVersion;
  if (options.repair) fields.repair = 'true';
  return request.post(`/api/capabilities/${id}/upgrade`, {
    multipart: {
      file: { name: 'pack.zip', mimeType: 'application/zip', buffer: pack },
      ...fields,
    },
  });
}

function errorBody(body: unknown): {
  code?: string;
  details?: { dependents?: string[]; repairAvailable?: boolean };
} {
  const parsed = body as {
    error?: { code?: string; details?: { dependents?: string[]; repairAvailable?: boolean } };
  };
  return parsed.error ?? {};
}

/** 建 mock 供应商 / 视觉模型 / 助手（任务运行需要 vision 能力） */
async function seedStack(request: APIRequestContext): Promise<{ assistantId: string; providerId: string; modelId: string }> {
  const providerRes = await request.post('/api/providers', {
    data: {
      name: PROVIDER_NAME,
      protocol: 'openai-compatible',
      baseUrl: 'http://mock.local/v1',
      apiKey: SENTINEL_KEY,
    },
  });
  expect(providerRes.ok()).toBeTruthy();
  const provider = ((await providerRes.json()) as Envelope<{ id: string }>).data!;
  const modelRes = await request.post(`/api/providers/${provider.id}/models`, {
    data: { modelId: 'mock-chat', capabilities: ['chat', 'vision'] },
  });
  expect(modelRes.ok()).toBeTruthy();
  const model = ((await modelRes.json()) as Envelope<{ id: string }>).data!;
  const assistantRes = await request.post('/api/assistants', {
    data: { name: ASSISTANT_NAME, modelId: model.id, enabledTools: [] },
  });
  expect(assistantRes.ok()).toBeTruthy();
  const assistant = ((await assistantRes.json()) as Envelope<{ id: string }>).data!;
  return { assistantId: assistant.id, providerId: provider.id, modelId: model.id };
}

async function waitForTaskStatus(request: APIRequestContext, id: string): Promise<string> {
  const deadline = Date.now() + 30_000;
  let status = 'queued';
  for (;;) {
    const res = await request.get(`/api/tasks/${id}`);
    status = ((await res.json()) as Envelope<{ run: { status: string } }>).data!.run.status;
    if (['completed', 'failed', 'stopped'].includes(status)) return status;
    if (Date.now() > deadline) return status;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

function flowGraph(output: string, withHuman = false) {
  const nodes = [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: { inputs: [] } },
    ...(withHuman
      ? [{ id: 'review', type: 'human', position: { x: 200, y: 0 }, config: { prompt: '审核发布？' } }]
      : []),
    { id: 'end', type: 'end', position: { x: 420, y: 0 }, config: { output } },
  ];
  const edges = withHuman
    ? [
        { id: 'e1', source: 'start', target: 'review' },
        { id: 'e2', source: 'review', target: 'end' },
      ]
    : [{ id: 'e1', source: 'start', target: 'end' }];
  return { nodes, edges };
}

test.describe.serial('v2.14 可维护运维链路', () => {
  let assistantId = '';
  let providerId = '';
  let modelId = '';
  let taskRunId = '';

  test.beforeAll(async ({ request }) => {
    await request.put('/api/settings', { data: { hasOnboarded: true } });
    const seeded = await seedStack(request);
    assistantId = seeded.assistantId;
    providerId = seeded.providerId;
    modelId = seeded.modelId;
  });

  test.afterAll(async ({ request }) => {
    if (assistantId) await request.delete(`/api/assistants/${assistantId}`).catch(() => {});
    if (modelId) await request.delete(`/api/models/${modelId}`).catch(() => {});
    if (providerId) await request.delete(`/api/providers/${providerId}`).catch(() => {});
  });

  test('① 技能升级后可从版本历史回退', async ({ page }) => {
    const id = 'com.wbfm.e2e.versioned-skill';
    const skillName = 'v214-versioned-skill';
    const v1 = skillPack({ id, skillName, version: '1.0.0', description: 'v1 内容' });
    const installed = await installPack(page.request, v1);
    const v2 = skillPack({ id, skillName, version: '2.0.0', description: 'v2 内容', content: 'v2' });
    const upgraded = await upgradePack(page.request, installed.id, v2);
    expect(upgraded.ok()).toBeTruthy();

    const versionsRes = await page.request.get(`/api/skills/${skillName}/versions`);
    const versions = ((await versionsRes.json()) as Envelope<{
      versioningAvailable: boolean;
      versions: Array<{ version: string; active: boolean }>;
    }>).data!;
    expect(versions.versioningAvailable).toBe(true);
    expect(versions.versions.map((item) => item.version).sort()).toEqual(['1.0.0', '2.0.0']);
    expect(versions.versions.find((item) => item.active)?.version).toBe('2.0.0');

    await page.goto('/settings');
    await skipOnboardingIfShown(page);
    await waitForHydrated(page);
    const skills = page.getByTestId('skills-panel');
    await skills.scrollIntoViewIfNeeded();
    const row = page.getByTestId('skill-item').filter({ hasText: skillName });
    await row.scrollIntoViewIfNeeded();
    await row.getByRole('button', { name: '版本历史' }).click();
    await expect(page.getByTestId('skill-versions')).toBeVisible();
    await expect(page.getByTestId('skill-versions').getByText('v1.0.0')).toBeVisible();
    await expect(page.getByTestId('skill-versions').getByText('v2.0.0')).toBeVisible();

    const v1Item = page.getByTestId('skill-version-item').filter({ hasText: 'v1.0.0' });
    await v1Item.getByRole('button', { name: '回退' }).click();
    await page.getByRole('button', { name: '确认回退' }).click();
    await expect(page.getByText(/已回退/)).toBeVisible();
    await expect(v1Item).toContainText('当前');

    const skillsRes = await page.request.get('/api/skills');
    const manifest = ((await skillsRes.json()) as Envelope<
      Array<{ name: string; manifest: { version: string } | null }>
    >).data!.find((item) => item.name === skillName)!.manifest;
    expect(manifest?.version).toBe('1.0.0');
    await page.request.delete(`/api/capabilities/${id}`);
  });

  test('② 工作流草稿不影响生产运行，历史版本可设为生产', async ({ page }) => {
    const created = await page.request.post('/api/flows', {
      data: { name: 'v214-production-flow', description: '生产版本 e2e' },
    });
    expect(created.status()).toBe(201);
    const wf = ((await created.json()) as Envelope<{ id: string }>).data!;

    const v1 = await page.request.post(`/api/flows/${wf.id}/versions`, {
      data: { graph: flowGraph('v1') },
    });
    expect(v1.status()).toBe(201);
    const published = await page.request.post(`/api/flows/${wf.id}/publish`, { data: {} });
    expect(published.ok()).toBeTruthy();
    const v2 = await page.request.post(`/api/flows/${wf.id}/versions`, {
      data: { graph: flowGraph('v2') },
    });
    expect(v2.status()).toBe(201);

    const detail = ((await (await page.request.get(`/api/flows/${wf.id}`)).json()) as Envelope<{
      workflow: { currentVersion: number; publishedVersion: number | null; status: string };
    }>).data!;
    expect(detail.workflow.currentVersion).toBe(2);
    expect(detail.workflow.publishedVersion).toBe(1);

    const runV1 = ((await (
      await page.request.post(`/api/flows/${wf.id}/runs`, { data: { input: {} } })
    ).json()) as Envelope<{ runId: string }>).data!;
    const runDetail = ((await (
      await page.request.get(`/api/flows/runs/${runV1.runId}`)
    ).json()) as Envelope<{ run: { version: number } }>).data!;
    expect(runDetail.run.version).toBe(1);

    const versionList = ((await (
      await page.request.get(`/api/flows/${wf.id}/versions`)
    ).json()) as Envelope<Array<{ version: number; production: boolean }>>).data!;
    expect(versionList.find((item) => item.version === 1)?.production).toBe(true);
    expect(versionList.find((item) => item.version === 2)?.production).toBe(false);

    const toV2 = await page.request.post(`/api/flows/${wf.id}/production`, { data: { version: 2 } });
    expect(toV2.ok()).toBeTruthy();
    const runV2 = ((await (
      await page.request.post(`/api/flows/${wf.id}/runs`, { data: { input: {} } })
    ).json()) as Envelope<{ runId: string }>).data!;
    const runV2Detail = ((await (
      await page.request.get(`/api/flows/runs/${runV2.runId}`)
    ).json()) as Envelope<{ run: { version: number } }>).data!;
    expect(runV2Detail.run.version).toBe(2);

    const back = await page.request.post(`/api/flows/${wf.id}/production`, { data: { version: 1 } });
    expect(back.ok()).toBeTruthy();
    const backList = ((await (
      await page.request.get(`/api/flows/${wf.id}/versions`)
    ).json()) as Envelope<Array<{ version: number; production: boolean }>>).data!;
    expect(backList.find((item) => item.version === 1)?.production).toBe(true);
    await page.request.delete(`/api/flows/${wf.id}`);
  });

  test('③ 能力包降级需确认，反向依赖拒绝，同版本可修复', async ({ page }) => {
    const parentId = 'com.wbfm.e2e.versioned-parent';
    const parent = await installPack(
      page.request,
      skillPack({ id: parentId, skillName: 'v214-parent-skill', version: '2.0.0', description: 'v2' }),
    );
    const childId = 'com.wbfm.e2e.versioned-child';
    const child = await installPack(
      page.request,
      skillPack({
        id: childId,
        skillName: 'v214-child-skill',
        version: '1.0.0',
        description: 'depends parent 2.0.0',
        dependencies: [{ id: parentId, version: '2.0.0' }],
      }),
    );

    const v1Pack = skillPack({ id: parentId, skillName: 'v214-parent-skill', version: '1.0.0', description: 'v1' });
    const noConfirm = await upgradePack(page.request, parent.id, v1Pack);
    expect(noConfirm.status()).toBe(422);
    expect(errorBody(await noConfirm.json()).code).toBe('CAPABILITY_DOWNGRADE_CONFIRM_REQUIRED');

    const mismatch = await upgradePack(page.request, parent.id, v1Pack, {
      confirmDowngrade: true,
      expectedVersion: '2.0.0',
    });
    expect(mismatch.status()).toBe(422);
    expect(errorBody(await mismatch.json()).code).toBe('CAPABILITY_DOWNGRADE_TARGET_MISMATCH');

    const blocked = await upgradePack(page.request, parent.id, v1Pack, {
      confirmDowngrade: true,
      expectedVersion: '1.0.0',
    });
    expect(blocked.status()).toBe(409);
    const blockedBody = errorBody(await blocked.json());
    expect(blockedBody.code).toBe('CAPABILITY_DEPENDENTS_ACTIVE');
    expect(blockedBody.details?.dependents).toContain(child.id);

    const disableChild = await page.request.post(`/api/capabilities/${child.id}/disable`);
    expect(disableChild.ok()).toBeTruthy();
    const downgraded = await upgradePack(page.request, parent.id, v1Pack, {
      confirmDowngrade: true,
      expectedVersion: '1.0.0',
    });
    expect(downgraded.ok()).toBeTruthy();
    const down = ((await downgraded.json()) as Envelope<{
      upgrade: { direction: string };
      capability: { version: string };
    }>).data!;
    expect(down.upgrade.direction).toBe('downgrade');
    expect(down.capability.version).toBe('1.0.0');

    const changed = skillPack({
      id: parentId,
      skillName: 'v214-parent-skill',
      version: '1.0.0',
      description: 'v1 repaired',
      content: 'repaired',
    });
    const probe = await upgradePack(page.request, parent.id, changed);
    expect(probe.status()).toBe(422);
    expect(errorBody(await probe.json()).code).toBe('CAPABILITY_VERSION_NOT_NEWER');
    const repaired = await upgradePack(page.request, parent.id, changed, { repair: true });
    expect(repaired.ok()).toBeTruthy();
    const repairDirection = ((await repaired.json()) as Envelope<{ upgrade: { direction: string } }>)
      .data!.upgrade.direction;
    expect(repairDirection).toBe('repair');

    await page.request.delete(`/api/capabilities/${child.id}`);
    await page.request.delete(`/api/capabilities/${parent.id}`);
  });

  test('④ 任务审计与审批项可跳转时间线与治理摘要', async ({ page }) => {
    const conversation = ((await (
      await page.request.post('/api/conversations', {
        data: { assistantId, title: 'v2.14 运维审计会话' },
      })
    ).json()) as Envelope<{ id: string }>).data!;
    const goal = 'v2.14 审计下钻任务 e2e';
    const created = await page.request.post('/api/tasks', {
      data: { conversationId: conversation.id, goal, permissionMode: 'confirm_each' },
    });
    expect(created.status()).toBe(201);
    const run = ((await created.json()) as Envelope<{ id: string }>).data!;
    taskRunId = run.id;
    void page.request.get(`/api/tasks/${run.id}/events`).catch(() => {});
    await waitForTaskStatus(page.request, run.id);

    const auditRes = await page.request.get(`/api/audit/events?runId=${run.id}&limit=100`);
    const events = ((await auditRes.json()) as Envelope<{
      events: Array<{ seq: number; kind: string }>;
    }>).data!.events;
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((item) => item.kind === 'run_started' || item.kind === 'run_finished')).toBe(true);

    await page.goto(`/audit?runId=${run.id}`);
    await skipOnboardingIfShown(page);
    await waitForHydrated(page);
    await expect(page.getByTestId('audit-page')).toBeVisible();
    await expect(page.locator('[data-testid^="audit-event-"]')).toHaveCount(events.length);
    const firstSeq = events[0]!.seq;
    await page.getByTestId(`audit-view-task-${firstSeq}`).click();
    await expect(page).toHaveURL(new RegExp(`/timeline\\?scope=task&id=${run.id}`));
    await expect(page.getByTestId('timeline-page')).toBeVisible();

    await page.goto('/tasks');
    await skipOnboardingIfShown(page);
    const row = page.getByTestId('task-row').filter({ hasText: goal });
    if ((await row.count()) === 0) {
      await page.getByText(goal, { exact: false }).first().click();
    } else {
      await row.first().click();
    }
    await expect(page.getByTestId(`task-governance-${run.id}`)).toBeVisible();
    await expect(page.getByTestId(`task-governance-${run.id}`)).toContainText('每次确认');
    await expect(page.getByTestId(`task-audit-event-${firstSeq}`)).toBeVisible();
    await expect(page.getByTestId(`task-audit-link-${run.id}`)).toHaveAttribute(
      'href',
      `/audit?runId=${run.id}`,
    );

    const approvalsRes = await page.request.get('/api/approvals');
    expect(approvalsRes.ok()).toBeTruthy();
  });

  test('④b 审批项 runId 链接可到达时间线', async ({ page }) => {
    const created = await page.request.post('/api/flows', {
      data: { name: 'v214-human-flow', description: '人工节点审批 e2e' },
    });
    const wf = ((await created.json()) as Envelope<{ id: string }>).data!;
    await page.request.post(`/api/flows/${wf.id}/versions`, {
      data: { graph: flowGraph('ok', true) },
    });
    await page.request.post(`/api/flows/${wf.id}/publish`, { data: {} });
    const run = ((await (
      await page.request.post(`/api/flows/${wf.id}/runs`, { data: { input: {} } })
    ).json()) as Envelope<{ runId: string }>).data!;
    void page.request.get(`/api/flows/runs/${run.runId}/events`).catch(() => {});

    let approvalId = '';
    const deadline = Date.now() + 30_000;
    while (!approvalId && Date.now() < deadline) {
      const approvals = ((await (await page.request.get('/api/approvals')).json()) as Envelope<{
        approvals: Array<{ id: string; source: string; runId: string | null }>;
      }>).data!.approvals;
      approvalId =
        approvals.find((item) => item.source === 'flow' && item.runId === run.runId)?.id ?? '';
      if (!approvalId) await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(approvalId).toBeTruthy();

    await page.goto('/approvals');
    await skipOnboardingIfShown(page);
    await waitForHydrated(page);
    await expect(page.getByTestId(`approval-${approvalId}`)).toBeVisible();
    await page.getByTestId(`approval-view-task-${approvalId}`).click();
    await expect(page.getByTestId('timeline-page')).toBeVisible();

    const resolved = await page.request.post(`/api/approvals/${approvalId}/resolve`, {
      data: { action: 'allow' },
    });
    expect(resolved.ok()).toBeTruthy();
    const deadline2 = Date.now() + 30_000;
    for (;;) {
      const detail = ((await (
        await page.request.get(`/api/flows/runs/${run.runId}`)
      ).json()) as Envelope<{ run: { status: string } }>).data!;
      if (['succeeded', 'failed', 'cancelled'].includes(detail.run.status)) break;
      if (Date.now() > deadline2) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await page.request.delete(`/api/flows/${wf.id}`);
  });

  test('⑤ 诊断包为白名单内容且不含哨兵密钥', async ({ page }) => {
    const res = await page.request.get('/api/diagnostics/export', { timeout: 60_000 });
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type']).toBe('application/zip');
    expect(res.headers()['content-disposition']).toContain('wbfm-diagnostics-2.14.0-');

    const files = unzipSync(new Uint8Array(await res.body()));
    for (const name of [
      'manifest.json',
      'versions.json',
      'audit-verify.json',
      'capabilities.json',
      'runs-summary.json',
      'settings-summary.json',
      'errors.log',
      'README.txt',
    ]) {
      expect(files[name], `缺少 ${name}`).toBeTruthy();
    }
    const texts = Object.values(files).map((bytes) => strFromU8(bytes));
    const all = texts.join('\n');
    expect(all).not.toContain(SENTINEL_KEY);
    expect(all).not.toContain(taskRunId);
    expect(all).not.toMatch(/[A-Za-z]:\\/);
    expect(all).not.toContain('file://');

    const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as {
      formatVersion: number;
      appVersion: string;
      entries: Array<{ path: string }>;
    };
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.appVersion).toBe('2.14.0');
    expect(manifest.entries.map((item) => item.path).sort()).toEqual(
      [
        'audit-verify.json',
        'capabilities.json',
        'errors.log',
        'README.txt',
        'runs-summary.json',
        'settings-summary.json',
        'versions.json',
      ].sort(),
    );
    const verify = JSON.parse(strFromU8(files['audit-verify.json']!)) as { ok: boolean };
    expect(verify.ok).toBe(true);

    await page.goto('/settings');
    await skipOnboardingIfShown(page);
    await waitForHydrated(page);
    const block = page.getByTestId('diagnostics-export-block');
    await block.scrollIntoViewIfNeeded();
    await expect(page.getByTestId('diagnostics-export')).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('diagnostics-export').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^wbfm-diagnostics-2\.14\.0-.*\.zip$/);
    await expect(page.getByText('诊断包已开始下载')).toBeVisible();
  });
});
