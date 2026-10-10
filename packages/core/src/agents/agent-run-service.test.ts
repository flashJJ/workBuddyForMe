import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAgentRunRepository,
  createDatabase,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { ApiError } from '@wbfm/shared/errors';
import type { ExecutorOutcome, SubtaskSpec } from '@wbfm/shared/schemas';
import { createAgentRunService, type AgentClientsProvider } from './index';
import type { AgentClients, AgentRunEvent } from './index';

async function collect(gen: AsyncGenerator<AgentRunEvent>): Promise<AgentRunEvent[]> {
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
async function driveIntoExecutor(
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

function makeSubtask(): SubtaskSpec {
  return { title: '子任务', brief: '说明', acceptance: ['标准1'] };
}
function makeOutcome(): ExecutorOutcome {
  return { summary: '交付', evidence: [], toolCalls: [], unfinished: [] };
}

/** 可挂起的脚本化客户端（executorHang 返回永不 resolve 的 promise 模拟长任务） */
function scriptedClients(options: { executorHang?: boolean } = {}): AgentClients {
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

describe('agent-run-service 运行管理', () => {
  let db: DatabaseInstance;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-agent-svc-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  const provider: AgentClientsProvider = () => scriptedClients();

  it('start 跑完全程：done 终态、3 条 handoff，消费后自动注销', async () => {
    const repo = createAgentRunRepository(db);
    const run = repo.create({ assistantId: 'a', goal: 'G' });
    const service = createAgentRunService({ db, clientsProvider: provider });

    const gen = service.start({ run });
    expect(service.isActive(run.id)).toBe(true);
    const events = await collect(gen);

    expect(service.isActive(run.id)).toBe(false);
    expect(service.activeRunIds()).toHaveLength(0);
    const pairs = events
      .filter((e) => e.event === 'agent_handoff')
      .map((e) => `${e.data.handoff.fromRole}→${e.data.handoff.toRole}`);
    expect(pairs).toEqual(['planner→executor', 'executor→reviewer', 'reviewer→user']);
    expect(repo.getById(run.id)!.status).toBe('done');
  });

  it('活跃中重复 start 抛 409', async () => {
    const repo = createAgentRunRepository(db);
    const run = repo.create({ assistantId: 'a', goal: 'G' });
    const hangProvider: AgentClientsProvider = () => scriptedClients({ executorHang: true });
    const service = createAgentRunService({ db, clientsProvider: hangProvider });

    const gen = service.start({ run });
    const { pending } = await driveIntoExecutor(gen);
    expect(service.isActive(run.id)).toBe(true);
    expect(() => service.start({ run })).toThrow(ApiError);
    service.stopAll();
    await pending;
    await collect(gen);
    expect(repo.getById(run.id)!.status).toBe('cancelled');
  });

  it('终态 run 再 start 抛 409；不存在 run 抛 404', () => {
    const repo = createAgentRunRepository(db);
    const run = repo.create({ assistantId: 'a', goal: 'G' });
    repo.finalize(run.id, { status: 'done', finalOutcome: makeOutcome() });
    const service = createAgentRunService({ db, clientsProvider: provider });

    expect(() => service.start({ run: repo.getById(run.id)! })).toThrow(/已终态/);
    expect(() => service.start({ run: { ...run, id: 'ghost' } })).toThrow(/不存在/);
  });

  it('未接角色通道（M1 骨架）：start 抛 501 NOT_IMPLEMENTED', () => {
    const repo = createAgentRunRepository(db);
    const run = repo.create({ assistantId: 'a', goal: 'G' });
    const service = createAgentRunService({ db });
    expect(service.hasClientsChannel()).toBe(false);
    try {
      service.start({ run });
      throw new Error('应当抛错');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(501);
      expect((error as ApiError).code).toBe('NOT_IMPLEMENTED');
    }
  });

  it('cancel：活跃→abort 收敛 cancelled；不存在 404；终态 409；未启动 false', async () => {
    const repo = createAgentRunRepository(db);
    const service = createAgentRunService({
      db,
      clientsProvider: () => scriptedClients({ executorHang: true }),
    });

    expect(() => service.cancel('ghost')).toThrow(/不存在/);

    const dormant = repo.create({ assistantId: 'a', goal: '休眠' });
    expect(service.cancel(dormant.id)).toBe(false);

    const run = repo.create({ assistantId: 'a', goal: 'G' });
    const gen = service.start({ run });
    const { pending } = await driveIntoExecutor(gen);
    expect(service.cancel(run.id)).toBe(true);
    await pending;
    await collect(gen);
    expect(repo.getById(run.id)!.status).toBe('cancelled');
    // 终态后再取消 → 409（状态机非法转移）
    expect(() => service.cancel(run.id)).toThrow(/已终态/);
  });

  it('stopAll：一次性急停全部活跃协作并返回数量', async () => {
    const repo = createAgentRunRepository(db);
    const service = createAgentRunService({
      db,
      clientsProvider: () => scriptedClients({ executorHang: true }),
    });
    const r1 = repo.create({ assistantId: 'a', goal: 'G1' });
    const r2 = repo.create({ assistantId: 'a', goal: 'G2' });
    const g1 = service.start({ run: r1 });
    const g2 = service.start({ run: r2 });
    const [d1, d2] = await Promise.all([driveIntoExecutor(g1), driveIntoExecutor(g2)]);
    expect(service.stopAll()).toBe(2);
    await Promise.all([d1.pending, d2.pending]);
    await Promise.all([collect(g1), collect(g2)]);
    expect(repo.getById(r1.id)!.status).toBe('cancelled');
    expect(repo.getById(r2.id)!.status).toBe('cancelled');
  });
});
