import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAgentRunRepository, type DatabaseInstance } from '@wbfm/database';
import type { AgentClientsProvider } from './index';
import { createAgentRunService } from './index';
import type { AgentRunEvent } from './index';
import {
  collect,
  createTestDb,
  driveIntoExecutor,
  scriptedClients,
} from './agent-run-test-harness';

/**
 * v1.9 M2：舞台只读观察（agentRunService.observe）。
 * 边界：观察连接不拥有 run、断线不 abort、晚加入回放整场、终态回落 null。
 */
describe('agent-run-service 舞台观察（observe）', () => {
  let db: DatabaseInstance;
  let testDb: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    testDb = createTestDb();
    db = testDb.db;
  });
  afterEach(() => testDb.cleanup());

  const provider: AgentClientsProvider = () => scriptedClients();

  it('晚加入自动回放已广播帧；观察者退订不杀 run；终态后回落 null', async () => {
    const repo = createAgentRunRepository(db);
    const service = createAgentRunService({
      db,
      clientsProvider: () => scriptedClients({ executorHang: true }),
    });
    const run = repo.create({ assistantId: 'a', goal: 'G' });
    const owner = await service.start({ run });
    const { pending } = await driveIntoExecutor(owner);
    expect(service.isActive(run.id)).toBe(true);

    // 舞台此时才打开：先拿到已缓冲帧（不阻塞、不需要 run 重新执行）
    const observer = service.observe(run.id);
    expect(observer).not.toBeNull();
    const first = await observer!.next();
    expect(first.done).toBe(false);
    expect(first.value.event).toBe('agent_phase');

    // 舞台关窗（观察者退订）：run 不受影响，owner 继续到终态
    await observer!.return!();
    expect(service.isActive(run.id)).toBe(true);
    service.stopAll();
    const terminal = await pending;
    const tail = await collect(owner);
    const ownerTail = terminal.done ? tail : [terminal.value, ...tail];
    expect(ownerTail.some((e) => e.event === 'done' || e.event === 'agent_phase')).toBe(true);
    expect(repo.getById(run.id)!.status).toBe('cancelled');

    // 再开舞台：活跃期已过回落 null（HTTP 层改走终态回放）
    expect(service.observe(run.id)).toBeNull();
  });

  it('观察者看完全程：事件序列与 owner 完全一致（含终态 done）', async () => {
    const repo = createAgentRunRepository(db);
    const service = createAgentRunService({ db, clientsProvider: provider });
    const run = repo.create({ assistantId: 'a', goal: 'G' });
    const owner = await service.start({ run });
    const observer = service.observe(run.id)!;

    const observed: AgentRunEvent[] = [];
    const observeDone = (async () => {
      for (;;) {
        const r = await observer.next();
        if (r.done) break;
        observed.push(r.value);
      }
    })();

    const ownerEvents = await collect(owner);
    await observeDone;
    expect(observed.map((e) => `${e.event}:${JSON.stringify(e.data)}`)).toEqual(
      ownerEvents.map((e) => `${e.event}:${JSON.stringify(e.data)}`),
    );
    expect(observed.at(-1)?.event).toBe('done');
  });

  it('run 不存在/未启动时 observe 返回 null', () => {
    const service = createAgentRunService({ db, clientsProvider: provider });
    expect(service.observe('ghost-run')).toBeNull();
  });

  it('舞台先于 owner 开窗：observeWhenReady 原子挂接，第一帧不丢', async () => {
    const repo = createAgentRunRepository(db);
    const service = createAgentRunService({ db, clientsProvider: provider });
    const run = repo.create({ assistantId: 'a', goal: 'G' });

    // 舞台先等（owner 尚未 start）
    const waitDone = service.observeWhenReady(run.id, 2000);
    await Promise.resolve();
    expect(service.observe(run.id)).toBeNull();

    // owner 随后启动并 pump 首帧：等待者拿到总线，观察者读到第一帧（零丢失）
    const owner = await service.start({ run });
    const observerPromise = waitDone;
    const ownerFirst = owner.next(); // 生成器惰性：owner SSE 开始消费才执行
    const observer = await observerPromise;
    expect(observer).not.toBeNull();
    await ownerFirst;
    const first = await observer!.next();
    expect(first.done).toBe(false);
    expect(first.value.event).toBe('agent_phase');

    await collect(owner);
  });
});
