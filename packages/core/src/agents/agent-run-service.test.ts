import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createAgentRunRepository, type DatabaseInstance } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import { createAgentRunService, type AgentClientsProvider } from './index';
import {
  collect,
  createTestDb,
  driveIntoExecutor,
  makeOutcome,
  scriptedClients,
} from './agent-run-test-harness';

describe('agent-run-service 运行管理', () => {
  let db: DatabaseInstance;
  let testDb: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    testDb = createTestDb();
    db = testDb.db;
  });

  afterEach(() => {
    testDb.cleanup();
  });

  const provider: AgentClientsProvider = () => scriptedClients();

  it('start 跑完全程：done 终态、3 条 handoff，消费后自动注销', async () => {
    const repo = createAgentRunRepository(db);
    const run = repo.create({ assistantId: 'a', goal: 'G' });
    const service = createAgentRunService({ db, clientsProvider: provider });

    const gen = await service.start({ run });
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

    const gen = await service.start({ run });
    const { pending } = await driveIntoExecutor(gen);
    expect(service.isActive(run.id)).toBe(true);
    await expect(service.start({ run })).rejects.toBeInstanceOf(ApiError);
    service.stopAll();
    await pending;
    await collect(gen);
    expect(repo.getById(run.id)!.status).toBe('cancelled');
  });

  it('终态 run 再 start 抛 409；不存在 run 抛 404', async () => {
    const repo = createAgentRunRepository(db);
    const run = repo.create({ assistantId: 'a', goal: 'G' });
    repo.finalize(run.id, { status: 'done', finalOutcome: makeOutcome() });
    const service = createAgentRunService({ db, clientsProvider: provider });

    await expect(service.start({ run: repo.getById(run.id)! })).rejects.toThrow(/已终态/);
    await expect(service.start({ run: { ...run, id: 'ghost' } })).rejects.toThrow(/不存在/);
  });

  it('未接角色通道（骨架）：start 抛 501 NOT_IMPLEMENTED', async () => {
    const repo = createAgentRunRepository(db);
    const run = repo.create({ assistantId: 'a', goal: 'G' });
    const service = createAgentRunService({ db });
    expect(service.hasClientsChannel()).toBe(false);
    const error = await service.start({ run }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(501);
    expect((error as ApiError).code).toBe('NOT_IMPLEMENTED');
  });

  it('provider 解析拒绝：start 抛业务错误且不占用活跃注册表', async () => {
    const repo = createAgentRunRepository(db);
    const run = repo.create({ assistantId: 'a', goal: 'G' });
    const failing = createAgentRunService({
      db,
      clientsProvider: () => {
        throw new ApiError('VALIDATION_ERROR', '未配置对话模型');
      },
    });
    await expect(failing.start({ run })).rejects.toThrow(/未配置对话模型/);
    expect(failing.activeRunIds()).toHaveLength(0);
  });

  it('cancel：活跃→abort 收敛 cancelled；未订阅 running→直接 cancelled；不存在 404；终态 409', async () => {
    const repo = createAgentRunRepository(db);
    const service = createAgentRunService({
      db,
      clientsProvider: () => scriptedClients({ executorHang: true }),
    });

    expect(() => service.cancel('ghost')).toThrow(/不存在/);

    // 已建行但事件流从未接通：直接落 cancelled，不遗留 running 孤儿
    const dormant = repo.create({ assistantId: 'a', goal: '休眠' });
    expect(service.cancel(dormant.id)).toBe(true);
    expect(repo.getById(dormant.id)!.status).toBe('cancelled');

    const run = repo.create({ assistantId: 'a', goal: 'G' });
    const gen = await service.start({ run });
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
    const g1 = await service.start({ run: r1 });
    const g2 = await service.start({ run: r2 });
    const [d1, d2] = await Promise.all([driveIntoExecutor(g1), driveIntoExecutor(g2)]);
    expect(service.stopAll()).toBe(2);
    await Promise.all([d1.pending, d2.pending]);
    await Promise.all([collect(g1), collect(g2)]);
    expect(repo.getById(r1.id)!.status).toBe('cancelled');
    expect(repo.getById(r2.id)!.status).toBe('cancelled');
  });
});
