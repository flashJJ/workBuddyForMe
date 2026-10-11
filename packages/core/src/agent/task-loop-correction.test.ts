import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, createTaskRunRepository, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import type { TaskRunView } from '@wbfm/shared/schemas';
import { createWebCipher } from '../secrets/cipher';
import type { ServiceDeps } from '../services/deps';
import type { TaskPlanner } from './types';
import { runTaskLoop } from './task-loop';
import { toModelText } from '../i18n/system-text';
import { collect, makeRuntime, mockTool } from './task-loop.helpers';

/**
 * v1.4 热修：授权知识库后「零检索即收尾」确定性门控（独立文件守 300 行门禁）。
 */
describe('task-loop 零检索收尾强制纠正', () => {
  let db: DatabaseInstance;
  let run: TaskRunView;
  let deps: ServiceDeps;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-taskloop-corr-')));
    db = createDatabase();
    const ts = '2026-09-30T00:00:00.000Z';
    db.prepare(`INSERT INTO assistants(id, name, created_at, updated_at) VALUES ('a1', 'A', ?, ?)`).run(ts, ts);
    db.prepare(`INSERT INTO conversations(id, assistant_id, title, created_at, updated_at) VALUES ('c1', 'a1', 'T', ?, ?)`).run(ts, ts);
    run = createTaskRunRepository(db).createRun({ conversationId: 'c1', assistantId: 'a1', goal: '基于简历规划', maxSteps: 20 });
    deps = { db, cipher: createWebCipher() };
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  it('未检索即 fail 被驳回并注入纠正，模型随后检索并 done', async () => {
    const runtime = makeRuntime({
      knowledge_search: mockTool('knowledge_search', 'read', async () => ({
        ok: true,
        output: '简历：AI 全栈工程师，10 年经验',
        summary: '命中 1 片',
      })),
    });

    let call = 0;
    const scripted: TaskPlanner = {
      async decide() {
        call += 1;
        if (call === 1) {
          return { action: 'fail', reason: '没有简历', message: '请提供简历' };
        }
        if (call === 2) {
          return { action: 'tool', tool: 'knowledge_search', args: { query: '简历' }, reason: '被纠正后检索' };
        }
        return { action: 'done', reason: '已取证', message: '规划如下…', unfinished: [] };
      },
    };

    const { final } = await collect(
      runTaskLoop({
        deps,
        runtime,
        planner: scripted,
        run,
        allowedTools: ['knowledge_search'],
        visionCapable: false,
        observeMode: 'tool',
      }),
    );

    expect(final.status).toBe('completed');
    const steps = createTaskRunRepository(db).listSteps(run.id);
    const correctionSteps = steps.filter((s) => toModelText(s.reason).includes('强制纠正'));
    expect(correctionSteps).toHaveLength(1);
    expect(steps.some((s) => s.kind === 'action' && s.toolName === 'knowledge_search' && s.status === 'completed')).toBe(true);
    expect(runtime.resolveTool('knowledge_search')?.tool.run).toHaveBeenCalledTimes(1);
  });

  it('纠正达宽限上限（2 次）后仍坚持 fail：尊重终态，防死循环', async () => {
    const runtime = makeRuntime({
      knowledge_search: mockTool('knowledge_search', 'read', async () => ({
        ok: true,
        output: '简历片段',
        summary: '命中',
      })),
    });
    const stubborn: TaskPlanner = {
      async decide() {
        return { action: 'fail', reason: '就是不检索', message: '放弃' };
      },
    };

    const { final } = await collect(
      runTaskLoop({
        deps,
        runtime,
        planner: stubborn,
        run,
        allowedTools: ['knowledge_search'],
        visionCapable: false,
        observeMode: 'tool',
      }),
    );

    expect(final.status).toBe('failed');
    const steps = createTaskRunRepository(db).listSteps(run.id);
    expect(steps.filter((s) => toModelText(s.reason).includes('强制纠正'))).toHaveLength(2);
    expect(runtime.resolveTool('knowledge_search')?.tool.run).not.toHaveBeenCalled();
  });

  it('未授权知识库时不干预 fail（普通无工具任务立即终态）', async () => {
    const runtime = makeRuntime({});
    const planner: TaskPlanner = {
      async decide() {
        return { action: 'fail', reason: '无工具无资料', message: '无法完成' };
      },
    };

    const { final } = await collect(
      runTaskLoop({
        deps,
        runtime,
        planner,
        run,
        allowedTools: [],
        visionCapable: false,
        observeMode: 'tool',
      }),
    );

    expect(final.status).toBe('failed');
    const steps = createTaskRunRepository(db).listSteps(run.id);
    expect(steps.some((s) => toModelText(s.reason).includes('强制纠正'))).toBe(false);
  });
});
