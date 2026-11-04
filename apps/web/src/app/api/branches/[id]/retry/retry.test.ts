import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, createSettingsRepository, type DatabaseInstance } from '@wbfm/database';
import { setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { BUILTIN_ASSISTANT } from '@wbfm/core/services';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { POST as CANCEL } from '../cancel/route';
import { POST as RETRY } from './route';

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('v2.22 分支重试 API', () => {
  let db: DatabaseInstance;
  let parentId: string;
  let services: ReturnType<typeof __buildContainerForTest>;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-web-retry-')));
    db = createDatabase(':memory:');
    services = __buildContainerForTest(db, createWebCipher());
    __setContainerForTest(services);
    parentId = services.conversations.create(BUILTIN_ASSISTANT.id, '父会话').id;
  });

  it('仅终态可重试：queued 分支返回 422', async () => {
    const branch = services.branches.create(parentId, { goal: '待重试' }).branch;
    const response = await RETRY(new Request('http://127.0.0.1/x'), params(branch.id));
    expect(response.status).toBe(422);
  });

  it('重试新建分支：旧分支保持 cancelled，响应带 retriedFrom', async () => {
    const { branch } = services.branches.create(parentId, { goal: '重试目标', title: '重试目标' });
    await CANCEL(new Request('http://127.0.0.1/x', { method: 'POST' }), params(branch.id));
    expect(services.branches.get(branch.id).status).toBe('cancelled');

    const response = await RETRY(new Request('http://127.0.0.1/x', { method: 'POST' }), params(branch.id));
    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      data: { branch: { id: string; status: string }; childConversationId: string; retriedFrom: string };
    };
    expect(payload.data.retriedFrom).toBe(branch.id);
    expect(payload.data.branch.id).not.toBe(branch.id);
    expect(payload.data.branch.status).toMatch(/queued|running|failed|succeeded/);
    expect(services.branches.get(branch.id).status).toBe('cancelled');
    await services.branches.whenSettled(payload.data.branch.id);
  });

  it('重试不绕过子节点上限', async () => {
    createSettingsRepository(db).setJson('app-settings', { branchMaxChildren: 1 });
    const { branch } = services.branches.create(parentId, { goal: '唯一分支' });
    services.branches.cancel(branch.id);
    const response = await RETRY(new Request('http://127.0.0.1/x', { method: 'POST' }), params(branch.id));
    expect(response.status).toBe(422);
  });
});
