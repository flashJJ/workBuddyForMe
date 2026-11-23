import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../client';
import { createWorkflowRepository } from '../workflow/workflow-repo';
import { createWorkflowTriggerRepository } from './workflow-trigger-repo';

function setup() {
  const db = createDatabase(':memory:');
  const wf = createWorkflowRepository(db).createWorkflow({ name: '事件' });
  return { wf, repo: createWorkflowTriggerRepository(db) };
}

describe('workflow trigger 仓储', () => {
  it('创建 Webhook 触发器：不回传 secret，只暴露路由与哈希列', () => {
    const { wf, repo } = setup();
    const created = repo.create({
      workflowId: wf.id,
      kind: 'webhook',
      name: '回调',
      config: null,
      secretHash: 'abc123',
    });
    expect(created).toMatchObject({
      kind: 'webhook',
      name: '回调',
      enabled: true,
      config: null,
      lastStatus: null,
    });
    expect(created.webhookPath).toContain(created.id);
    expect(repo.getById(created.id)).toEqual(created);
  });

  it('文件触发器保持配置，可更新启停与路径', () => {
    const { wf, repo } = setup();
    const created = repo.create({
      workflowId: wf.id,
      kind: 'file',
      name: '下载目录',
      config: { path: 'E:\\downloads', extensions: ['md'], recursive: true },
    });
    expect(created.config).toEqual({ path: 'E:\\downloads', extensions: ['md'], recursive: true });
    expect(created.webhookPath).toBeNull();

    const updated = repo.update(created.id, {
      enabled: false,
      config: { path: 'E:\\notes', extensions: ['md', 'txt'] },
    });
    expect(updated).toMatchObject({
      enabled: false,
      config: { path: 'E:\\notes', extensions: ['md', 'txt'] },
    });
    expect(repo.listEnabledByKind('file')).toHaveLength(0);
  });

  it('按流程统计与列举，记录触发结果', () => {
    const { wf, repo } = setup();
    const webhook = repo.create({ workflowId: wf.id, kind: 'webhook', name: '', config: null, secretHash: 'h' });
    repo.create({ workflowId: wf.id, kind: 'file', name: '', config: { path: 'E:\\x', extensions: ['md'] } });
    expect(repo.countByWorkflow(wf.id, 'webhook')).toBe(1);
    expect(repo.countByWorkflow(wf.id, 'file')).toBe(1);
    expect(repo.listByWorkflow(wf.id)).toHaveLength(2);
    expect(repo.listEnabledByKind('webhook')).toHaveLength(1);

    repo.recordOutcome(webhook.id, {
      lastFiredAt: '2026-11-23T10:00:00.000Z',
      lastRunId: 'r1',
      lastStatus: 'created',
    });
    expect(repo.getById(webhook.id)).toMatchObject({
      lastFiredAt: '2026-11-23T10:00:00.000Z',
      lastRunId: 'r1',
      lastStatus: 'created',
    });
    expect(repo.remove(webhook.id)).toBe(true);
    expect(repo.getById(webhook.id)).toBeNull();
  });
});
