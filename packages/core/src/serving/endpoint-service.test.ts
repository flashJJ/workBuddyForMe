import type { FlowGraph } from '@wbfm/shared/schemas';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import {
  createWorkflowEndpointRepository,
  createWorkflowRepository,
} from '@wbfm/database';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEndpointService, PublicEndpointError } from './endpoint-service';

const graph: FlowGraph = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
    { id: 'end', type: 'end', position: { x: 100, y: 0 }, config: { output: 'OK' } },
  ],
  edges: [{ id: 'e1', source: 'start', target: 'end' }],
};

const BASE_CONFIG = {
  httpEnabled: true,
  mcpEnabled: false,
  syncTimeoutMs: 60_000,
  rateLimitPerMin: 30,
} as const;

describe('endpoint-service（v0.9）', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  function setup(seed: 'published' | 'draft' = 'published') {
    const workflows = createWorkflowRepository(db);
    const endpoints = createWorkflowEndpointRepository(db);
    const service = createEndpointService({ endpoints, workflows });
    const wf = workflows.createWorkflow({ name: '摘要器' });
    workflows.addVersion(wf.id, graph);
    if (seed === 'published') workflows.publishVersion(wf.id);
    return { service, endpoints, workflows, wfId: wf.id };
  }

  function expectCode(fn: () => unknown, code: string): void {
    try {
      fn();
      throw new Error('应当抛出 PublicEndpointError');
    } catch (error) {
      expect(error).toBeInstanceOf(PublicEndpointError);
      expect((error as PublicEndpointError).code).toBe(code);
    }
  }

  it('首次开启建行并一次性返回明文密钥；再次保存改配不再返回明文', () => {
    const { service, wfId } = setup();
    const first = service.createOrUpdate(wfId, BASE_CONFIG);
    expect(first.plaintextKey).toMatch(/^wfk_[0-9a-f]{40}$/);
    const again = service.createOrUpdate(wfId, { ...BASE_CONFIG, rateLimitPerMin: 60 });
    expect(again.plaintextKey).toBeUndefined();
    expect(again.endpoint.rateLimitPerMin).toBe(60);
  });

  it('两个暴露位都关时不建行（NO_EXPOSURE）；workflow 不存在抛 WORKFLOW_NOT_FOUND', () => {
    const { service, wfId } = setup();
    expect(() =>
      service.createOrUpdate(wfId, { ...BASE_CONFIG, httpEnabled: false }),
    ).toThrowError(expect.objectContaining({ code: 'NO_EXPOSURE' }));
    expect(service.getByWorkflow(wfId)).toBeNull();
    expect(() => service.rotateKey('nope')).toThrowError(
      expect.objectContaining({ code: 'WORKFLOW_NOT_FOUND' }),
    );
  });

  it('重置密钥后旧密钥即时失效、新密钥可用', () => {
    const { service, wfId } = setup();
    const { plaintextKey: oldKey } = service.createOrUpdate(wfId, BASE_CONFIG);
    const { plaintextKey: newKey } = service.rotateKey(wfId);
    expect(oldKey).not.toBe(newKey);
    expectCode(() => service.authenticate(`Bearer ${oldKey}`, 'http'), 'endpoint_not_found');
    expect(service.authenticate(`Bearer ${newKey}`, 'http').workflowId).toBe(wfId);
  });

  it('鉴权矩阵：401/404/409 各错误码', () => {
    const published = setup();
    const { plaintextKey } = published.service.createOrUpdate(published.wfId, BASE_CONFIG);
    const bearer = `Bearer ${plaintextKey}`;

    // 无/空 Bearer
    expectCode(() => published.service.authenticate(null, 'http'), 'unauthorized');
    expectCode(() => published.service.authenticate('Bearer ', 'http'), 'unauthorized');
    // 错误密钥（与停用统一 404 混淆，防枚举）
    expectCode(() => published.service.authenticate('Bearer wfk_x', 'http'), 'endpoint_not_found');
    // MCP 协议位未开
    expectCode(() => published.service.authenticate(bearer, 'mcp'), 'endpoint_disabled');
    // 策略待重确认
    published.endpoints.setRevalidation(published.service.getByWorkflow(published.wfId)!.id, true);
    expectCode(() => published.service.authenticate(bearer, 'http'), 'policy_revalidation_required');
    // 整体停用 → 404
    published.service.setStatus(published.wfId, 'disabled');
    expectCode(() => published.service.authenticate(bearer, 'http'), 'endpoint_not_found');

    // 未发布流程：建行本身允许，但鉴权时 409
    const draft = setup('draft');
    const draftEp = draft.service.createOrUpdate(draft.wfId, BASE_CONFIG);
    expectCode(
      () => draft.service.authenticate(`Bearer ${draftEp.plaintextKey}`, 'http'),
      'workflow_not_published',
    );

    // 已发布端点对应的工作流被停用
    published.service.setStatus(published.wfId, 'enabled');
    published.workflows.setStatus(published.wfId, 'disabled');
    expectCode(() => published.service.authenticate(bearer, 'http'), 'workflow_not_published');
  });
});
