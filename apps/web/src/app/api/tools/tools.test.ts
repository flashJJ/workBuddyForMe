import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core';
import {
  __buildContainerForTest,
  __setContainerForTest,
  type ServiceContainer,
} from '@/lib/server/container';
import { POST as confirmTool } from './confirm/route';
import { GET as listPermissions } from './permissions/route';
import { DELETE as revokePermission } from './permissions/[id]/route';
import { GET as listBreakers, POST as resetBreaker } from './breakers/route';

const jsonRequest = (body: unknown, method = 'POST') =>
  new Request('http://127.0.0.1/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe('工具确认与权限管理路由（v0.6 M2）', () => {
  let db: DatabaseInstance;
  let services: ServiceContainer;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-web-tools-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    services = __buildContainerForTest(db, createWebCipher());
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('confirm：非法 body 422（缺 callId / remember=assistant 缺 assistantId）', async () => {
    const noCallId = await confirmTool(jsonRequest({ tool: 'fetch_webpage', action: 'allow' }));
    expect(noCallId.status).toBe(422);

    const noAssistant = await confirmTool(
      jsonRequest({ callId: 'c1', tool: 'fetch_webpage', action: 'allow', remember: 'assistant' }),
    );
    expect(noAssistant.status).toBe(422);
  });

  it('confirm：callId 不存在或已超时返回 404', async () => {
    const res = await confirmTool(
      jsonRequest({ callId: 'no-such-call', tool: 'fetch_webpage', action: 'allow' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
  });

  it('confirm：resolve 挂起项成功，allow+remember=assistant 写入助手级授权', async () => {
    const pending = services.confirmations.request('call-1');
    const res = await confirmTool(
      jsonRequest({
        callId: 'call-1',
        tool: 'fetch_webpage',
        action: 'allow',
        remember: 'assistant',
        assistantId: 'asst-1',
      }),
    );
    expect(res.status).toBe(200);
    await expect(pending).resolves.toBe('allow');

    // 授权记录已写入
    expect(services.permissions.isAllowed('fetch_webpage', 'danger', 'assistant:asst-1')).toBe(true);
    // 其他助手不受影响
    expect(services.permissions.isAllowed('fetch_webpage', 'danger', 'assistant:asst-2')).toBe(false);
  });

  it('confirm：allow+remember=all 写入全局授权；deny 不写记录', async () => {
    const pendingAll = services.confirmations.request('call-2');
    const resAll = await confirmTool(
      jsonRequest({ callId: 'call-2', tool: 'fetch_webpage', action: 'allow', remember: 'all' }),
    );
    expect(resAll.status).toBe(200);
    await expect(pendingAll).resolves.toBe('allow');
    expect(services.permissions.isAllowed('fetch_webpage', 'danger', 'assistant:anyone')).toBe(true);

    const pendingDeny = services.confirmations.request('call-3');
    const resDeny = await confirmTool(
      jsonRequest({ callId: 'call-3', tool: 'other_tool', action: 'deny', remember: 'all' }),
    );
    expect(resDeny.status).toBe(200);
    await expect(pendingDeny).resolves.toBe('deny');
    expect(services.permissions.listPermissions('other_tool')).toEqual([]);
  });

  it('permissions：GET 列表 + toolName 过滤；DELETE 撤销后 404', async () => {
    // 空列表
    const empty = await listPermissions(new Request('http://x'));
    expect((await empty.json()).data).toEqual([]);

    // 造两条记录
    services.permissions.grantPermission('fetch_webpage', 'all', 'allow');
    services.permissions.grantPermission('knowledge_search', 'assistant:a1', 'allow');

    const all = await listPermissions(new Request('http://x'));
    const rows = (await all.json()).data;
    expect(rows).toHaveLength(2);

    const filtered = await listPermissions(new Request('http://x?toolName=fetch_webpage'));
    const filteredRows = (await filtered.json()).data;
    expect(filteredRows).toHaveLength(1);
    expect(filteredRows[0].toolName).toBe('fetch_webpage');

    // 撤销
    const targetId = rows[0].id;
    const removed = await revokePermission(new Request('http://x', { method: 'DELETE' }), idParams(targetId));
    expect(removed.status).toBe(200);

    const after = await listPermissions(new Request('http://x'));
    expect((await after.json()).data).toHaveLength(1);

    const again = await revokePermission(new Request('http://x', { method: 'DELETE' }), idParams(targetId));
    expect(again.status).toBe(404);
  });

  it('breakers：GET 列出熔断中工具；POST 重置后列表为空', async () => {
    // 初始为空
    const empty = await listBreakers(new Request('http://x'));
    expect((await empty.json()).data).toEqual([]);

    // 造一条熔断记录：连续 3 次失败（默认阈值）
    services.breakers.recordResult('fetch_webpage', false);
    services.breakers.recordResult('fetch_webpage', false);
    services.breakers.recordResult('fetch_webpage', false);
    expect(services.breakers.isTripped('fetch_webpage')).toBe(true);

    const tripped = await listBreakers(new Request('http://x'));
    const rows = (await tripped.json()).data;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('fetch_webpage');
    expect(rows[0].status).toBe('open');
    expect(rows[0].failures).toBe(3);

    // 重置
    const reset = await resetBreaker(jsonRequest({ name: 'fetch_webpage' }));
    expect(reset.status).toBe(200);
    expect((await reset.json()).data).toEqual({ name: 'fetch_webpage', ok: true });
    expect(services.breakers.isTripped('fetch_webpage')).toBe(false);

    const after = await listBreakers(new Request('http://x'));
    expect((await after.json()).data).toEqual([]);
  });

  it('breakers：POST 非法 body 422（name 缺失/空串）', async () => {
    const noName = await resetBreaker(jsonRequest({}));
    expect(noName.status).toBe(422);

    const emptyName = await resetBreaker(jsonRequest({ name: '  ' }));
    expect(emptyName.status).toBe(422);
  });

  it('breakers：POST 重置不存在的工具幂等成功（视为已重置）', async () => {
    const res = await resetBreaker(jsonRequest({ name: 'never_tripped_tool' }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.ok).toBe(true);
  });
});
