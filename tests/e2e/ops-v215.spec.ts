import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { waitForHydrated } from './utils';

/**
 * v2.15 可运营运维链路 e2e（契约 §9 测试矩阵）：
 * ① 技能版本占用与非启用版本删除；② 审计区间归档与锚点校验；
 * ③ Provider 凭证轮换；④ 工作流版本对比。
 */

type Envelope<T> = { data?: T };

const PROVIDER_NAME = 'v215-rotate-mock';
const API_KEY = 'sk-v215-rotate-abcd';
const API_KEY_MASKED = 'sk-****abcd';

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
    dependencies: [],
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
): Promise<{ id: string }> {
  const res = await request.post('/api/capabilities/install', {
    multipart: { file: { name: 'pack.zip', mimeType: 'application/zip', buffer: pack } },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as Envelope<{ id: string }>).data!;
}

async function upgradePack(
  request: APIRequestContext,
  id: string,
  pack: Buffer,
): Promise<void> {
  const res = await request.post(`/api/capabilities/${id}/upgrade`, {
    multipart: { file: { name: 'pack.zip', mimeType: 'application/zip', buffer: pack } },
  });
  expect(res.ok()).toBeTruthy();
}

function flowGraph(output: string): {
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; config: unknown }>;
  edges: Array<{ id: string; source: string; target: string }>;
} {
  return {
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: { inputs: [] } },
      { id: 'end', type: 'end', position: { x: 400, y: 0 }, config: { output } },
    ],
    edges: [{ id: 'e1', source: 'start', target: 'end' }],
  };
}

/** v2 图：新增 llm 节点、改 end 配置、换两条连线 */
function flowGraphV2(): ReturnType<typeof flowGraph> {
  return {
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: { inputs: [] } },
      { id: 'llm', type: 'llm', position: { x: 260, y: 0 }, config: { modelId: 'mock-chat' } },
      { id: 'end', type: 'end', position: { x: 620, y: 0 }, config: { output: 'v2' } },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'llm' },
      { id: 'e2', source: 'llm', target: 'end' },
    ],
  };
}

test.describe.serial('v2.15 可运营运维链路', () => {
  /** 归档生成的锚点，供下一例校验 */
  let anchorRef: Record<string, unknown>;

  test.beforeAll(async ({ request }) => {
    await request.put('/api/settings', { data: { hasOnboarded: true } });
  });

  test('① 技能版本展示占用，非启用版本可删除且 active 受保护', async ({ page }) => {
    const id = 'com.wbfm.e2e.v215-cleanup-skill';
    const skillName = 'v215-cleanup-skill';
    const installed = await installPack(
      page.request,
      skillPack({ id, skillName, version: '1.0.0', description: 'v1 内容' }),
    );
    await upgradePack(
      page.request,
      installed.id,
      skillPack({ id, skillName, version: '2.0.0', description: 'v2 内容', content: 'v2' }),
    );

    const before = ((await (
      await page.request.get(`/api/skills/${skillName}/versions`)
    ).json()) as Envelope<{
      versions: Array<{ version: string; active: boolean; sizeBytes: number }>;
      totalBytes: number;
    }>).data!;
    expect(before.versions.map((item) => item.version).sort()).toEqual(['1.0.0', '2.0.0']);
    expect(before.versions.find((item) => item.active)?.version).toBe('2.0.0');
    expect(before.totalBytes).toBeGreaterThan(0);

    await page.goto('/settings');
    await skipOnboardingIfShown(page);
    await waitForHydrated(page);
    const skills = page.getByTestId('skills-panel');
    await skills.scrollIntoViewIfNeeded();
    const row = page.getByTestId('skill-item').filter({ hasText: skillName });
    await row.scrollIntoViewIfNeeded();
    await row.getByRole('button', { name: '版本历史' }).click();
    await expect(page.getByTestId('skill-versions')).toBeVisible();
    await expect(page.getByTestId('skill-versions-total')).toContainText('共 2 版');
    await expect(page.getByTestId('skill-version-delete-2.0.0')).toHaveCount(0);
    await expect(page.getByTestId('skill-version-protected')).toContainText('当前版本');

    await page.getByTestId('skill-version-delete-1.0.0').click();
    await page.getByRole('button', { name: '确认删除' }).click();
    await expect(page.getByText(/已删除 v1\.0\.0/)).toBeVisible();
    await expect(
      page.getByTestId('skill-version-item').filter({ hasText: 'v1.0.0' }),
    ).toHaveCount(0);

    const after = ((await (
      await page.request.get(`/api/skills/${skillName}/versions`)
    ).json()) as Envelope<{ versions: Array<{ version: string; active: boolean }>; totalBytes: number }>)
      .data!;
    expect(after.versions.map((item) => item.version)).toEqual(['2.0.0']);
    expect(after.totalBytes).toBeLessThan(before.totalBytes);

    const activeDelete = await page.request.delete(`/api/skills/${skillName}/versions/2.0.0`);
    expect(activeDelete.status()).toBe(409);
    expect(((await activeDelete.json()) as { error: { code: string } }).error.code).toBe(
      'SKILL_VERSION_ACTIVE',
    );
    const secondDelete = await page.request.delete(`/api/skills/${skillName}/versions/1.0.0`);
    expect(secondDelete.status()).toBe(409);
    expect(((await secondDelete.json()) as { error: { code: string } }).error.code).toBe(
      'SKILL_VERSION_MISSING',
    );

    await page.request.delete(`/api/capabilities/${id}`);
  });

  test('② 审计区间归档返回 JSONL 与全账本尾锚点', async ({ page }) => {
    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    const res = await page.request.get(
      `/api/audit/archive?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type']).toBe('application/zip');
    expect(res.headers()['content-disposition']).toContain('audit-archive-');

    const files = unzipSync(new Uint8Array(await res.body()));
    expect(files['events.jsonl']).toBeTruthy();
    expect(files['anchor.json']).toBeTruthy();
    const lines = strFromU8(files['events.jsonl']!).trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    const anchor = JSON.parse(strFromU8(files['anchor.json']!)) as unknown as Record<
      string,
      unknown
    >;
    const parsed = anchor as {
      formatVersion: number;
      appVersion: string;
      schemaVersion: number;
      range: { count: number; lastSeq: number | null; lastHash: string | null; chain: { ok: boolean } };
      ledger: { lastSeq: number | null; lastHash: string | null };
    };
    expect(parsed.formatVersion).toBe(1);
    expect(parsed.schemaVersion).toBe(42);
    expect(parsed.range.count).toBe(lines.length);
    expect(parsed.ledger.lastSeq).not.toBeNull();
    expect(parsed.range.chain.ok).toBe(true);
    anchorRef = anchor;
  });

  test('②b 锚点校验覆盖通过 / 截断 / 错位 / 断链 / 非法格式', async ({ page }) => {
    const anchor = anchorRef;
    expect(anchor).toBeTruthy();

    const ok = await page.request.post('/api/audit/anchor/verify', { data: anchor });
    expect(ok.ok()).toBeTruthy();
    const okData = ((await ok.json()) as Envelope<{ ok: boolean; code: string; current: { lastSeq: number } }>)
      .data!;
    expect(okData.ok).toBe(true);
    expect(okData.code).toBe('ANCHOR_OK');

    const truncated = JSON.parse(JSON.stringify(anchor)) as {
      ledger: { lastSeq: number };
    };
    truncated.ledger.lastSeq = okData.current.lastSeq + 100;
    const truncatedRes = await page.request.post('/api/audit/anchor/verify', { data: truncated });
    expect(((await truncatedRes.json()) as Envelope<{ code: string }>).data!.code).toBe(
      'ANCHOR_TAIL_TRUNCATED',
    );

    const mismatched = JSON.parse(JSON.stringify(anchor)) as {
      range: { lastHash: string };
    };
    const original = mismatched.range.lastHash;
    mismatched.range.lastHash = `${original[0] === 'a' ? 'b' : 'a'}${original.slice(1)}`;
    const mismatchRes = await page.request.post('/api/audit/anchor/verify', { data: mismatched });
    expect(((await mismatchRes.json()) as Envelope<{ code: string }>).data!.code).toBe(
      'ANCHOR_MISMATCH',
    );

    const broken = JSON.parse(JSON.stringify(anchor)) as { range: { chain: { ok: boolean } } };
    broken.range.chain.ok = false;
    const brokenRes = await page.request.post('/api/audit/anchor/verify', { data: broken });
    expect(((await brokenRes.json()) as Envelope<{ code: string }>).data!.code).toBe(
      'ANCHOR_CHAIN_BROKEN',
    );

    const invalid = await page.request.post('/api/audit/anchor/verify', { data: {} });
    expect(invalid.status()).toBe(422);

    const anchorPath = test.info().outputPath('v215-anchor.json');
    await page.goto('/audit');
    await skipOnboardingIfShown(page);
    await waitForHydrated(page);
    await expect(page.getByTestId('audit-page')).toBeVisible();
    // /audit 打开时的链校验会写入 audit_verified，需等它落账后再生成 UI 用锚点
    await expect(page.getByTestId('audit-chain-status')).toBeVisible();

    const freshFrom = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const freshTo = new Date(Date.now() + 60_000).toISOString();
    const freshRes = await page.request.get(
      `/api/audit/archive?from=${encodeURIComponent(freshFrom)}&to=${encodeURIComponent(freshTo)}`,
    );
    const freshFiles = unzipSync(new Uint8Array(await freshRes.body()));
    writeFileSync(anchorPath, strFromU8(freshFiles['anchor.json']!));

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('audit-export-archive').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^audit-archive-\d{8}-\d{6}\.zip$/);
    await expect(page.getByText('归档已开始下载')).toBeVisible();

    await page.getByTestId('audit-anchor-input').setInputFiles(anchorPath);
    await expect(page.getByTestId('audit-anchor-result')).toContainText('锚点与当前账本一致');
  });

  test('③ Provider 凭证轮换后仍可解密并按原掩码展示', async ({ page }) => {
    const created = await page.request.post('/api/providers', {
      data: {
        name: PROVIDER_NAME,
        protocol: 'openai-compatible',
        baseUrl: 'http://mock.local/v1',
        apiKey: API_KEY,
      },
    });
    expect(created.ok()).toBeTruthy();
    const provider = ((await created.json()) as Envelope<{ id: string }>).data!;

    const rotated = await page.request.post('/api/secrets/rotate');
    expect(rotated.ok()).toBeTruthy();
    const result = ((await rotated.json()) as Envelope<{
      mode: string;
      total: number;
      rotated: number;
      skipped: number;
      failed: number;
    }>).data!;
    expect(result.mode).toBe('web');
    expect(result.rotated).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);

    const providers = ((await (await page.request.get('/api/providers')).json()) as Envelope<
      Array<{ id: string; apiKeyMasked: string | null }>
    >).data!;
    expect(providers.find((item) => item.id === provider.id)?.apiKeyMasked).toBe(API_KEY_MASKED);

    await page.goto('/settings');
    await skipOnboardingIfShown(page);
    await waitForHydrated(page);
    const block = page.getByTestId('secret-rotation-block');
    await block.scrollIntoViewIfNeeded();
    await expect(page.getByTestId('secret-rotation')).toBeVisible();
    await page.getByTestId('secret-rotation').click();
    await page.getByRole('button', { name: '确认轮换' }).click();
    await expect(page.getByText(/已重新加密 \d+ 个凭证/)).toBeVisible();

    await page.request.delete(`/api/providers/${provider.id}`);
  });

  test('④ 任意两版对比准确列出节点 / 边 / 配置差异且只读', async ({ page }) => {
    const created = await page.request.post('/api/flows', {
      data: { name: 'v215-compare-flow', description: '版本对比 e2e' },
    });
    expect(created.status()).toBe(201);
    const wf = ((await created.json()) as Envelope<{ id: string }>).data!;
    expect((await page.request.post(`/api/flows/${wf.id}/versions`, { data: { graph: flowGraph('v1') } })).status()).toBe(201);
    expect((await page.request.post(`/api/flows/${wf.id}/publish`, { data: {} })).ok()).toBeTruthy();
    expect((await page.request.post(`/api/flows/${wf.id}/versions`, { data: { graph: flowGraphV2() } })).status()).toBe(201);

    const diff = ((await (
      await page.request.get(`/api/flows/${wf.id}/versions/compare?from=1&to=2`)
    ).json()) as Envelope<{
      nodes: {
        added: Array<{ id: string; type: string }>;
        removed: unknown[];
        typeChanged: unknown[];
        configChanged: Array<{ id: string; keys: string[] }>;
      };
      edges: { added: unknown[]; removed: unknown[] };
      summary: Record<string, number>;
    }>).data!;
    expect(diff.nodes.added).toEqual([{ id: 'llm', type: 'llm' }]);
    expect(diff.nodes.removed).toEqual([]);
    expect(diff.nodes.typeChanged).toEqual([]);
    expect(diff.nodes.configChanged).toEqual([{ id: 'end', type: 'end', keys: ['output'] }]);
    expect(diff.edges.added).toHaveLength(2);
    expect(diff.edges.removed).toHaveLength(1);
    expect(diff.summary).toMatchObject({
      nodesAdded: 1,
      nodesRemoved: 0,
      nodesTypeChanged: 0,
      nodesConfigChanged: 1,
      edgesAdded: 2,
      edgesRemoved: 1,
    });

    const same = ((await (
      await page.request.get(`/api/flows/${wf.id}/versions/compare?from=2&to=2`)
    ).json()) as Envelope<{ summary: Record<string, number> }>).data!;
    expect(Object.values(same.summary).every((value) => value === 0)).toBe(true);
    const missing = await page.request.get(`/api/flows/${wf.id}/versions/compare?from=1&to=99`);
    expect(missing.status()).toBe(404);
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe(
      'FLOW_VERSION_NOT_FOUND',
    );

    await page.goto(`/flows/${wf.id}`);
    await skipOnboardingIfShown(page);
    await waitForHydrated(page);
    await page.getByRole('button', { name: '版本历史' }).click();
    await expect(page.getByTestId('flow-version-list')).toBeVisible();
    await expect(page.getByTestId('flow-version-compare')).toBeVisible();
    await page.getByTestId('flow-compare-run').click();
    await expect(page.getByTestId('flow-version-diff')).toBeVisible();
    await expect(page.getByTestId('flow-version-diff')).toContainText('llm (llm)');
    await expect(page.getByTestId('flow-version-diff')).toContainText('end: output');

    const detail = ((await (await page.request.get(`/api/flows/${wf.id}`)).json()) as Envelope<{
      workflow: { currentVersion: number; publishedVersion: number | null };
    }>).data!;
    expect(detail.workflow.currentVersion).toBe(2);
    expect(detail.workflow.publishedVersion).toBe(1);
    await page.request.delete(`/api/flows/${wf.id}`);
  });
});
