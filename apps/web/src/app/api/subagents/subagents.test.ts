import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import type { ServiceContainer } from '@/lib/server/container-types';
import { PUT as updateSettings } from '../settings/route';
import { GET as listProviders } from './providers/route';
import { GET as listRuns, POST as startRun } from './runs/route';
import { POST as cancelRun } from './runs/[id]/cancel/route';

function enableBody() {
  return JSON.stringify({
    subagentCliEnabled: true,
    subagentCliCommand: process.execPath,
    subagentCliArgs: [],
    subagentCliTimeoutMs: 600_000,
    subagentCliMaxOutputBytes: 2_097_152,
  });
}

describe('v2.11 外部代理 API', () => {
  let db: DatabaseInstance;
  let cwd: string;
  let services: ServiceContainer;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-web-sub-agent-')));
    cwd = mkdtempSync(join(tmpdir(), 'wbfm-web-sub-cwd-'));
    db = createDatabase(':memory:');
    services = __buildContainerForTest(db, createWebCipher());
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('默认未启用：提供方为空；启用后可用', async () => {
    const before = await listProviders(new Request('http://x/api/subagents/providers'));
    expect((await before.json()).data.providers).toEqual([]);

    const enabled = await updateSettings(
      new Request('http://x/api/settings', { method: 'PUT', body: enableBody() }),
    );
    expect(enabled.status).toBe(200);
    const after = await listProviders(new Request('http://x/api/subagents/providers'));
    const providers = (await after.json()).data.providers;
    expect(providers).toHaveLength(1);
    expect(providers[0]).toMatchObject({ id: 'local-cli', available: true });
  });

  it('非法 cwd 422；关闭开关后提供方注销', async () => {
    await updateSettings(
      new Request('http://x/api/settings', { method: 'PUT', body: enableBody() }),
    );
    const bad = await startRun(
      new Request('http://x/api/subagents/runs', {
        method: 'POST',
        body: JSON.stringify({ goal: 'x', cwd: 'relative/dir' }),
      }),
    );
    expect(bad.status).toBe(422);

    await updateSettings(
      new Request('http://x/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ subagentCliEnabled: false }),
      }),
    );
    const after = await listProviders(new Request('http://x/api/subagents/providers'));
    expect((await after.json()).data.providers).toEqual([]);
  });

  it('发起运行先审批；取消后收敛为 cancelled 并有记录', async () => {
    await updateSettings(
      new Request('http://x/api/settings', { method: 'PUT', body: enableBody() }),
    );
    const created = await startRun(
      new Request('http://x/api/subagents/runs', {
        method: 'POST',
        body: JSON.stringify({ goal: '整理 README', cwd }),
      }),
    );
    expect(created.status).toBe(201);
    const run = (await created.json()).data;
    expect(run.status).toBe('queued');

    expect(services.approvals.list().map((item) => item.id)).toContain(run.id);

    const cancelled = await cancelRun(
      new Request(`http://x/api/subagents/runs/${run.id}/cancel`, { method: 'POST' }),
      { params: Promise.resolve({ id: run.id }) },
    );
    expect(cancelled.status).toBe(200);
    const settled = await services.subagentRuns.whenSettled(run.id);
    expect(settled.status).toBe('cancelled');
    expect(settled.errorCode).toBe('cancelled');

    const list = await listRuns(new Request('http://x/api/subagents/runs?limit=5'), {
      params: Promise.resolve({}),
    });
    const runs = (await list.json()).data;
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe(run.id);

    const missing = await cancelRun(
      new Request('http://x/api/subagents/runs/missing/cancel', { method: 'POST' }),
      { params: Promise.resolve({ id: 'missing' }) },
    );
    expect(missing.status).toBe(404);
  });
});
