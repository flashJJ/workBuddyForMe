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
});
