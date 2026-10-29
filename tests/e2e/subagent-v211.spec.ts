import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

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

type Envelope<T> = { data?: T };

const FIXTURE = `
process.stdin.once('data', () => {
  process.stdout.write(JSON.stringify({ type: 'delta', text: 'e2e ' }) + '\\n');
  process.stdout.write(JSON.stringify({ type: 'done', summary: 'e2e done' }) + '\\n');
});
`;

test.describe('v2.11 外部代理', () => {
  test('启用 → 审批 → 运行 → 证据可查', async ({ page }) => {
    await page.request.put('/api/settings', { data: { hasOnboarded: true } });
    const dir = mkdtempSync(join(tmpdir(), 'wbfm-e2e-subagent-'));
    const fixture = join(dir, 'agent.js');
    writeFileSync(fixture, FIXTURE, 'utf8');

    const enabled = await page.request.put('/api/settings', {
      data: {
        subagentCliEnabled: true,
        subagentCliCommand: process.execPath,
        subagentCliArgs: [fixture],
        subagentCliTimeoutMs: 60_000,
        subagentCliMaxOutputBytes: 65_536,
      },
    });
    expect(enabled.ok()).toBeTruthy();

    const providers = ((await (
      await page.request.get('/api/subagents/providers')
    ).json()) as Envelope<{ providers: Array<{ id: string; available: boolean }> }>).data!
      .providers;
    expect(providers).toEqual([
      expect.objectContaining({ id: 'local-cli', available: true }),
    ]);

    const created = await page.request.post('/api/subagents/runs', {
      data: { goal: 'e2e 外部代理', cwd: process.cwd() },
    });
    expect(created.status()).toBe(201);
    const run = ((await created.json()) as Envelope<{
      id: string;
      status: string;
    }>).data!;
    expect(run.status).toBe('queued');

    let approvalId: string | null = null;
    for (let i = 0; i < 30 && !approvalId; i++) {
      const approvals = ((await (
        await page.request.get('/api/approvals')
      ).json()) as Envelope<{
        approvals: Array<{ id: string; source: string; runId: string | null }>;
      }>).data!.approvals;
      approvalId =
        approvals.find((item) => item.source === 'subagent' && item.runId === run.id)?.id ?? null;
      if (!approvalId) await page.waitForTimeout(100);
    }
    expect(approvalId).toBeTruthy();
    const resolved = await page.request.post(`/api/approvals/${approvalId}/resolve`, {
      data: { action: 'allow' },
    });
    expect(resolved.ok()).toBeTruthy();

    let status = 'queued';
    let summary: string | null = null;
    for (let i = 0; i < 60; i++) {
      const list = ((await (
        await page.request.get('/api/subagents/runs?limit=10')
      ).json()) as Envelope<Array<{ id: string; status: string; summary: string | null }>>).data ?? [];
      const hit = list.find((item) => item.id === run.id);
      if (hit) {
        status = hit.status;
        summary = hit.summary;
      }
      if (status === 'done' || status === 'failed' || status === 'cancelled') break;
      await page.waitForTimeout(100);
    }
    expect(status).toBe('done');
    expect(summary).toBe('e2e done');

    const events = ((await (
      await page.request.get(`/api/events?scope=agent&scopeId=${run.id}`)
    ).json()) as Envelope<{ events: Array<{ type: string }> }>).data!;
    const types = events.events.map((item) => item.type);
    expect(types).toContain('subagent_started');
    expect(types).toContain('subagent_finished');

    await page.goto('/capabilities');
    await skipOnboardingIfShown(page);
    await expect(page.getByTestId('capability-external')).toBeVisible();
    await expect(page.getByTestId('subagent-panel')).toBeVisible();
    await expect(page.getByTestId(`subagent-run-${run.id}`)).toBeVisible();

    await page.request.put('/api/settings', { data: { subagentCliEnabled: false } });
    const after = ((await (
      await page.request.get('/api/subagents/providers')
    ).json()) as Envelope<{ providers: unknown[] }>).data!.providers;
    expect(after).toEqual([]);
  });
});
