/**
 * v1.9 M2：agent-run-service 测试共用夹具（agent-run-service / observer 两组测试复用）。
 * 仅测试侧使用：脚本化角色客户端 + 推进到 executor 挂起点 + 内存 DB。
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import type { ExecutorOutcome, SubtaskSpec } from '@wbfm/shared/schemas';
import type { AgentClients, AgentRunEvent } from './index';

export async function collect(gen: AsyncGenerator<AgentRunEvent>): Promise<AgentRunEvent[]> {
  const events: AgentRunEvent[] = [];
  for (;;) {
    const r = await gen.next();
    if (r.done) break;
    events.push(r.value);
  }
  return events;
}

/**
 * 驱动运行进入 executor 挂起点：
 * executor.run 前有 4 个 yield（planning/budget/plan-handoff/executing），
 * 第 5 次 next 恢复时同步进入 executor 并挂起；让微任务跑完后返回该 pending。
 * 注意 pending 必须用对象包装返回：直接 return Promise 会被外层 await 采用，
 * 在 abort（cancel/stopAll）之前形成死锁。
 */
export async function driveIntoExecutor(
  gen: AsyncGenerator<AgentRunEvent>,
): Promise<{ pending: Promise<IteratorResult<AgentRunEvent>> }> {
  for (let i = 0; i < 4; i += 1) {
    await gen.next();
  }
  const pending = gen.next();
  await Promise.resolve();
  await Promise.resolve();
  return { pending };
}

export function makeSubtask(): SubtaskSpec {
  return { title: '子任务', brief: '说明', acceptance: ['标准1'] };
}

export function makeOutcome(): ExecutorOutcome {
  return { summary: '交付', evidence: [], toolCalls: [], unfinished: [] };
}

/** 可挂起的脚本化客户端（executorHang 返回永不 resolve 的 promise 模拟长任务） */
export function scriptedClients(options: { executorHang?: boolean } = {}): AgentClients {
  return {
    planner: {
      async plan() {
        return { subtask: makeSubtask(), usage: { promptTokens: 1, completionTokens: 1 } };
      },
    },
    executor: {
      async run(_input, signal) {
        if (options.executorHang) {
          await new Promise<void>((resolve) => {
            signal?.addEventListener('abort', () => resolve());
          });
          throw new Error('aborted');
        }
        return { outcome: makeOutcome(), usage: { promptTokens: 1, completionTokens: 1 }, steps: 1 };
      },
    },
    reviewer: {
      async review() {
        return {
          review: { verdict: 'approve', acceptanceResults: [] },
          usage: { promptTokens: 1, completionTokens: 1 },
        };
      },
    },
  };
}

export interface TestDb {
  db: DatabaseInstance;
  cleanup: () => void;
}

export function createTestDb(): TestDb {
  const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-agent-svc-'));
  setDataRootForTest(tempRoot);
  const db = createDatabase(':memory:');
  return {
    db,
    cleanup: () => {
      db.close();
      resetDataRootForTest();
    },
  };
}
