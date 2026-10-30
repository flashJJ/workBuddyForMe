import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET, PUT } from './route';

const jsonRequest = (body: unknown, method = 'PUT') =>
  new Request('http://127.0.0.1/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** Next 路由上下文：无动态段时也要提供 params Promise */
const routeContext = { params: Promise.resolve({}) };

describe('Agent 策略 API（v2.13 M2）', () => {
  let db: DatabaseInstance;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-policy-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('GET 返回默认策略与哈希', async () => {
    const response = await GET(new Request('http://127.0.0.1/x'), routeContext);
    const data = (await response.json()).data;
    expect(data.policy.defaultMode).toBe('confirm_each');
    expect(data.policy.unattended.allowedModes).not.toContain('full_access');
    expect(data.hash).toHaveLength(64);
  });

  it('PUT 保存计划模式并回读；非法形状 422', async () => {
    const current = (await (await GET(new Request('http://127.0.0.1/x'), routeContext)).json()).data
      .policy;
    const next = { ...current, defaultMode: 'plan_only' };
    const saved = await PUT(jsonRequest(next), routeContext);
    expect(saved.status).toBe(200);
    const savedData = (await saved.json()).data;
    expect(savedData.policy.defaultMode).toBe('plan_only');

    const bad = await PUT(jsonRequest({ defaultMode: 'nope' }), routeContext);
    expect(bad.status).toBe(422);
  });
});
