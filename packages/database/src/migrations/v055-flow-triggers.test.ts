import { describe, expect, it } from 'vitest';
import { createDatabase } from '../client';
import { createWorkflowRepository } from '../repositories/workflow/workflow-repo';
import { createWorkflowTriggerRepository } from '../repositories/trigger/workflow-trigger-repo';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

describe('v055 流程事件触发配置', () => {
  it('迁移后存在 workflow_triggers 与两个索引', () => {
    const db = createDatabase(':memory:');
    const result = applyMigrations(db);
    expect(result.to).toBe(LATEST_SCHEMA_VERSION);
    expect(getSchemaVersion(db)).toBe(58);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workflow_triggers'")
      .all();
    expect(tables).toHaveLength(1);
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_workflow_triggers_workflow','idx_workflow_triggers_kind')",
      )
      .all();
    expect(indexes).toHaveLength(2);
    const columns = db.prepare('PRAGMA table_info(workflow_triggers)').all() as Array<{ name: string }>;
    expect(columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['workflow_id', 'kind', 'enabled', 'config_json', 'secret_hash']),
    );
  });

  it('删除流程级联清理触发器', () => {
    const db = createDatabase(':memory:');
    applyMigrations(db);
    const workflows = createWorkflowRepository(db);
    const triggers = createWorkflowTriggerRepository(db);
    const wf = workflows.createWorkflow({ name: '事件' });
    triggers.create({ workflowId: wf.id, kind: 'webhook', name: '回调', config: null, secretHash: 'h' });
    expect(triggers.listByWorkflow(wf.id)).toHaveLength(1);

    workflows.deleteWorkflow(wf.id);
    expect(triggers.listByWorkflow(wf.id)).toHaveLength(0);
  });
});
