/**
 * v0.7 M4：tasks 轨 roundtrip 与外键约束测试（从 restore.test.ts 拆出以满足 300 行门禁）。
 */
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  type DatabaseInstance,
  createConversationRepository,
  createTaskRunRepository,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { exportBackup } from './export';
import { restoreBackup } from './restore';
import { createWebCipher } from '../secrets/cipher';
import { ensureSeedData } from '../services/seed';

describe('tasks 轨备份恢复（v0.7 M4）', () => {
  let srcDb: DatabaseInstance;
  let dstDb: DatabaseInstance;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-tasks-restore-'));
    setDataRootForTest(tempRoot);
    srcDb = createDatabase(':memory:');
    dstDb = createDatabase(':memory:');
  });

  afterEach(() => {
    srcDb.close();
    dstDb.close();
    resetDataRootForTest();
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('roundtrip：幂等跳过 + 状态字段原样保留', async () => {
    ensureSeedData(srcDb);
    const convRepo = createConversationRepository(srcDb);
    const taskRepo = createTaskRunRepository(srcDb);
    const conv = convRepo.create({ assistantId: 'builtin-general', title: '任务对话' });
    const run = taskRepo.createRun({
      conversationId: conv.id,
      assistantId: 'builtin-general',
      goal: '打开记事本保存',
      maxSteps: 10,
    });
    const step = taskRepo.addStep({ runId: run.id, stepIndex: 1, kind: 'observe', reason: '观察屏幕' });
    taskRepo.finishStep(step.id, { status: 'completed', resultJson: '{}', durationMs: 50 });

    // 必须同时导出 conversations 轨：tasks 外键依赖 conversations
    const { archive } = await exportBackup({ db: srcDb, cipher: createWebCipher() }, {
      tracks: ['tasks', 'conversations'],
    });

    // 第一次恢复：导入 1 个 run + 1 个 step
    const r1 = await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);
    expect(r1.imported.tasks).toBe(1);
    expect(r1.skipped.tasks).toBe(0);

    const dstTaskRepo = createTaskRunRepository(dstDb);
    const restored = dstTaskRepo.getRun(run.id);
    expect(restored?.goal).toBe('打开记事本保存');
    expect(restored?.status).toBe('queued'); // 状态字段原样保留
    expect(dstTaskRepo.listSteps(run.id)).toHaveLength(1);
    expect(dstTaskRepo.listSteps(run.id)[0]!.reason).toBe('观察屏幕');

    // 第二次恢复：幂等跳过
    const r2 = await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);
    expect(r2.imported.tasks).toBe(0);
    expect(r2.skipped.tasks).toBe(1);
  });

  it('tasks 的 conversation 不存在：外键约束静默跳过', async () => {
    ensureSeedData(srcDb);
    // 临时关闭 FK，在源库插入引用不存在 conversation 的孤儿 task_run
    srcDb.pragma('foreign_keys = OFF');
    srcDb.prepare(
      `INSERT INTO task_runs(id, conversation_id, assistant_id, goal, status, step_count, failure_count, max_steps, stop_reason, created_at, updated_at, finished_at)
       VALUES (?, ?, ?, ?, 'queued', 0, 0, 10, NULL, ?, ?, NULL)`,
    ).run(
      'orphan-task',
      'nonexistent-conv',
      'builtin-general',
      '孤儿任务',
      new Date().toISOString(),
      new Date().toISOString(),
    );
    srcDb.pragma('foreign_keys = ON');

    const { archive } = await exportBackup({ db: srcDb, cipher: createWebCipher() }, { tracks: ['tasks'] });
    const result = await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);
    expect(result.imported.tasks).toBe(0);
    expect(result.skipped.tasks).toBe(1);
  });

  it('v1.4：协作运行记录不进备份；tasks 轨恢复后 agent 表为空、归属列回落 NULL', async () => {
    ensureSeedData(srcDb);
    const convRepo = createConversationRepository(srcDb);
    const taskRepo = createTaskRunRepository(srcDb);
    const conv = convRepo.create({ assistantId: 'builtin-general', title: '协作对话' });

    // 源库存在一次协作运行与交接，且 task_run 归属该运行（M1 仓储落地前的直接 SQL 形态）
    const now = new Date().toISOString();
    srcDb
      .prepare(
        `INSERT INTO agent_runs(id,conversation_id,assistant_id,goal,created_at,updated_at)
         VALUES('ar1',?, 'builtin-general','协作目标',?,?)`,
      )
      .run(conv.id, now, now);
    srcDb
      .prepare(
        `INSERT INTO agent_handoffs(id,run_id,round_no,seq,from_role,to_role,payload,created_at)
         VALUES('h1','ar1',0,0,'planner','executor','{"subtask":{}}',?)`,
      )
      .run(now);
    const run = taskRepo.createRun({
      conversationId: conv.id,
      assistantId: 'builtin-general',
      goal: '执行子任务',
      maxSteps: 5,
    });
    srcDb.prepare(`UPDATE task_runs SET agent_run_id='ar1' WHERE id=?`).run(run.id);

    const { archive } = await exportBackup({ db: srcDb, cipher: createWebCipher() }, {
      tracks: ['tasks', 'conversations'],
    });
    const result = await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);
    expect(result.imported.tasks).toBe(1);

    // 协作表随 v019 迁移存在，但不随备份迁移（与 workflow_runs 同级运行记录）
    const agentRuns = dstDb.prepare(`SELECT COUNT(*) AS n FROM agent_runs`).get() as { n: number };
    const handoffs = dstDb.prepare(`SELECT COUNT(*) AS n FROM agent_handoffs`).get() as {
      n: number;
    };
    expect(agentRuns.n).toBe(0);
    expect(handoffs.n).toBe(0);

    // 恢复的 task_run 归属列回落 NULL，无悬空 FK
    const restored = dstDb
      .prepare(`SELECT agent_run_id AS agentRunId FROM task_runs WHERE id=?`)
      .get(run.id) as { agentRunId: string | null };
    expect(restored.agentRunId).toBeNull();
  });
});
