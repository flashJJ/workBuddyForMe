import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FlowGraph } from '@wbfm/shared';
import {
  createDatabase,
  createWorkflowEndpointRepository,
  createWorkflowRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { setDataRootForTest, resetDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core';
import { __buildContainerForTest, __setContainerForTest, getServices } from '@/lib/server/container';
import { POST as invoke } from './route';
import { GET as getRun } from '../runs/[runId]/route';

const graph = (output: string): FlowGraph => ({
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
    { id: 'end', type: 'end', position: { x: 100, y: 0 }, config: { output } },
  ],
  edges: [{ id: 'e1', source: 'start', target: 'end' }],
});

const graphWithInput: FlowGraph = {
  nodes: [
    {
      id: 'start',
      type: 'start',
      position: { x: 0, y: 0 },
      config: { inputs: [{ name: 'url', type: 'string', required: true }] },
    },
    { id: 'end', type: 'end', position: { x: 100, y: 0 }, config: { output: 'OK' } },
  ],
  edges: [{ id: 'e1', source: 'start', target: 'end' }],
};

const invokeRequest = (key: string, init: RequestInit = {}, query = '') =>
  new Request(`http://127.0.0.1:3000/api/public/flows/${key}/invoke${query}`, {
    method: 'POST',
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

describe('公开 invoke 路由（v0.9 M2）', () => {
  let db: DatabaseInstance;
  let key: string;
  let workflowId: string;
  let otherKey: string;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-public-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    const services = __buildContainerForTest(db, createWebCipher());

    const workflows = createWorkflowRepository(db);
    const wf = workflows.createWorkflow({ name: '公开流程' });
    workflows.addVersion(wf.id, graph('HELLO'));
    workflows.publishVersion(wf.id);
    workflowId = wf.id;
    key = services.endpoints.createOrUpdate(wf.id, {
      httpEnabled: true,
      mcpEnabled: false,
      syncTimeoutMs: 10_000,
      rateLimitPerMin: 30,
    }).plaintextKey!;

    const wf2 = workflows.createWorkflow({ name: '另一个' });
    workflows.addVersion(wf2.id, graph('BYE'));
    workflows.publishVersion(wf2.id);
    otherKey = services.endpoints.createOrUpdate(wf2.id, {
      httpEnabled: true,
      mcpEnabled: false,
      syncTimeoutMs: 10_000,
      rateLimitPerMin: 30,
    }).plaintextKey!;
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('sync 调用：200 + succeeded + 终态输出；业务失败也为 200', async () => {
    const res = await invoke(
      invokeRequest(key, {
        headers: { authorization: `Bearer ${key}` },
        body: '{}',
      }),
      { params: Promise.resolve({ key }) },
    );
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.success).toBe(true);
    expect(payload.data.status).toBe('succeeded');
    expect(payload.data.output).toBe('HELLO');
  });

  it('mode=async：立即 202 + runId + X-WBFM-Async 头', async () => {
    const res = await invoke(
      invokeRequest(
        key,
        { headers: { authorization: `Bearer ${key}` }, body: '{}' },
        '?mode=async',
      ),
      { params: Promise.resolve({ key }) },
    );
    expect(res.status).toBe(202);
    expect(res.headers.get('x-wbfm-async')).toBe('1');
    const payload = await res.json();
    expect(payload.data.runId).toBeTruthy();
    expect(payload.data.status).toBe('queued');
    // 等待后台队列执行完毕再结束用例，避免关库后残留 tick
    const finished = await getServices().flowRunner.waitForTerminal(payload.data.runId, 5_000);
    expect(finished.timedOut).toBe(false);
    expect(finished.run?.status).toBe('succeeded');
  });

  it('鉴权与 Host：无 Bearer 401；错密钥 404；非环回 Host 403', async () => {
    const noAuth = await invoke(invokeRequest(key, { body: '{}' }), {
      params: Promise.resolve({ key }),
    });
    expect(noAuth.status).toBe(401);
    expect((await noAuth.json()).error.code).toBe('unauthorized');

    const badKey = await invoke(
      invokeRequest(key, { headers: { authorization: 'Bearer wfk_deadbeef' }, body: '{}' }),
      { params: Promise.resolve({ key }) },
    );
    expect(badKey.status).toBe(404);
    expect((await badKey.json()).error.code).toBe('endpoint_not_found');

    const evil = await invoke(
      new Request('http://evil.example/api/public/flows/x/invoke', {
        method: 'POST',
        headers: { authorization: 'Bearer y' },
        body: '{}',
      }),
      { params: Promise.resolve({ key: 'x' }) },
    );
    expect(evil.status).toBe(403);
    expect((await evil.json()).error.code).toBe('invalid_host');
  });

  it('入参不符 start schema：422 validation_failed 带字段详情', async () => {
    // 替换为带必填入参的图
    const workflows = createWorkflowRepository(db);
    workflows.addVersion(workflowId, graphWithInput);
    workflows.publishVersion(workflowId);
    const res = await invoke(
      invokeRequest(key, { headers: { authorization: `Bearer ${key}` }, body: '{}' }),
      { params: Promise.resolve({ key }) },
    );
    expect(res.status).toBe(422);
    const payload = await res.json();
    expect(payload.error.code).toBe('validation_failed');
    expect(payload.error.details.map((d: { path: string }) => d.path)).toContain('url');
  });

  it('超频 429 + Retry-After；跨 key 读运行 404 隔离', async () => {
    // 把配额调到 2（直接更新端点行）
    const repo = createWorkflowEndpointRepository(db);
    const ep = repo.getByWorkflowId(workflowId)!;
    repo.updateConfig(ep.id, {
      httpEnabled: true,
      mcpEnabled: false,
      syncTimeoutMs: 10_000,
      rateLimitPerMin: 2,
    });

    const call = () =>
      invoke(
        invokeRequest(key, { headers: { authorization: `Bearer ${key}` }, body: '{}' }),
        { params: Promise.resolve({ key }) },
      );
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    const limited = await call();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    expect((await limited.json()).error.code).toBe('rate_limited');

    // 用另一流程的密钥读不存在/不属于它的 run → 404（隔离 + 不暴露存在性）
    const runRes = await getRun(
      new Request('http://127.0.0.1:3000/api/public/flows/other/runs/nope', {
        method: 'GET',
        headers: { authorization: `Bearer ${otherKey}` },
      }),
      { params: Promise.resolve({ key: otherKey, runId: 'nope' }) },
    );
    expect(runRes.status).toBe(404);
  });
});
