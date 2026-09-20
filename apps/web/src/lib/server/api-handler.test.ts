import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core';
import { GET as health } from '@/app/api/health/route';
import { __buildContainerForTest, __setContainerForTest } from './container';
import { defineRoute } from './with-api-handler';
import { jsonOk } from './api-response';
import { parseBody, readJsonBody } from './validation';

const schema = z.object({ name: z.string().min(1) });

const validatedRoute = defineRoute(async ({ request }) => {
  const body = parseBody(schema, await readJsonBody(request));
  return jsonOk({ received: body.name });
});

const failingRoute = defineRoute(async () => {
  throw new Error('boom');
});

const notFoundRoute = defineRoute(({ services }) => {
  services.conversations.get('missing-id');
  return jsonOk(null);
});

describe('API 基础设施（TR-18.1）', () => {
  let db: DatabaseInstance;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-web-t18-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
    vi.unstubAllEnvs();
  });

  it('health 200 且包络结构一致', async () => {
    const response = await health(new Request('http://127.0.0.1/api/health'));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({ success: true, data: { status: 'ok' } });
  });

  it('正常 200：JSON 校验通过返回数据包络', async () => {
    const response = await validatedRoute(
      new Request('http://127.0.0.1/api/test', {
        method: 'POST',
        body: JSON.stringify({ name: '工作伙伴' }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { received: '工作伙伴' } });
  });

  it('校验失败：非法 JSON / Zod 失败均返回 422 + 错误码与字段详情', async () => {
    const badJson = await validatedRoute(
      new Request('http://x', { method: 'POST', body: '{bad' }),
    );
    expect(badJson.status).toBe(422);
    expect((await badJson.json()).error.code).toBe('VALIDATION_ERROR');

    const zodFail = await validatedRoute(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ name: '' }) }),
    );
    const payload = await zodFail.json();
    expect(zodFail.status).toBe(422);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe('VALIDATION_ERROR');
    expect(payload.error.details[0].path).toBe('name');
  });

  it('业务错误 404 与未知错误 500 均被包络化', async () => {
    const notFound = await notFoundRoute(new Request('http://x'));
    expect(notFound.status).toBe(404);
    expect((await notFound.json()).error.code).toBe('NOT_FOUND');

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const internal = await failingRoute(new Request('http://x'));
    expect(internal.status).toBe(500);
    expect((await internal.json()).error.code).toBe('INTERNAL_ERROR');
  });

  it('Electron 托管模式：无令牌 401，携带正确令牌放行', async () => {
    vi.stubEnv('WBFM_SERVER_MANAGED', '1');
    vi.stubEnv('WBFM_TOKEN', 'secret-token');

    const rejected = await validatedRoute(
      new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({ name: 'a' }),
      }),
    );
    expect(rejected.status).toBe(401);
    expect((await rejected.json()).error.code).toBe('UNAUTHORIZED');

    const allowed = await validatedRoute(
      new Request('http://x', {
        method: 'POST',
        headers: { 'x-wbfm-token': 'secret-token' },
        body: JSON.stringify({ name: 'a' }),
      }),
    );
    expect(allowed.status).toBe(200);
  });
});
