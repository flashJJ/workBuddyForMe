import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, createConversationRepository, createSettingsRepository } from '@wbfm/database';
import type { ServiceDeps } from '../services/base/deps';
import { createBranchService } from './branch-service';
import { collectBranchArtifacts } from './branch-evidence';
import type { BranchChatRunner } from './branch-runner';

const cipher = {
  encrypt: (value: string) => value,
  decrypt: (value: string) => value,
};

function setup(): { deps: ServiceDeps; parentId: string; db: ReturnType<typeof createDatabase> } {
  const db = createDatabase(':memory:');
  db.prepare(
    `INSERT INTO assistants(id, name, created_at, updated_at) VALUES ('a1', 'A', 't', 't')`,
  ).run();
  db.prepare(
    `INSERT INTO conversations(id, assistant_id, title, created_at, updated_at)
     VALUES ('p1', 'a1', '父会话', 't', 't')`,
  ).run();
  return {
    deps: { db, cipher } as unknown as ServiceDeps,
    parentId: 'p1',
    db,
  };
}

function runnerOf(events: Array<{ event: string; data: unknown }>): BranchChatRunner {
  return async function* () {
    for (const event of events) yield event as never;
  };
}

describe('v2.21 分支服务', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('派生：创建独立子会话、记录根/深度、父会话保持', () => {
    const service = createBranchService(ctx.deps);
    const { branch, childConversationId } = service.create(ctx.parentId, {
      goal: '整理竞品',
      title: '竞品调研',
    });
    expect(branch).toMatchObject({
      status: 'queued',
      depth: 1,
      rootConversationId: 'p1',
      parentConversationId: 'p1',
      title: '竞品调研',
    });
    const child = createConversationRepository(ctx.db).findById(childConversationId);
    expect(child?.title).toBe('竞品调研');
    expect(createConversationRepository(ctx.db).findById('p1')?.title).toBe('父会话');
  });

  it('派生继承父会话显式选择的模型', () => {
    ctx.db
      .prepare(
        `INSERT INTO providers(id, name, base_url, created_at, updated_at)
         VALUES ('prov1', 'P', 'http://mock.local', 't', 't')`,
      )
      .run();
    ctx.db
      .prepare(
        `INSERT INTO models(id, provider_id, model_id, display_name, created_at)
         VALUES ('model-branch', 'prov1', 'model-branch', 'M', 't')`,
      )
      .run();
    createConversationRepository(ctx.db).setModelId('p1', 'model-branch');
    const service = createBranchService(ctx.deps);
    const { childConversationId } = service.create(ctx.parentId, { goal: '继承模型' });
    expect(createConversationRepository(ctx.db).findById(childConversationId)?.modelId).toBe(
      'model-branch',
    );
  });

  it('autoStart：终态 succeeded 并生成带 needsReview 的 evidence', async () => {
    const service = createBranchService(ctx.deps, {
      runner: runnerOf([
        { event: 'delta', data: { content: '结论' } },
        {
          event: 'done',
          data: {
            content: '结论：竞品 A 领先',
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          },
        },
      ]),
    });
    const { branch } = service.create(ctx.parentId, { goal: '调研', autoStart: true });
    await service.whenSettled(branch.id);
    const settled = service.get(branch.id);
    expect(settled.status).toBe('succeeded');
    expect(settled.evidence).toMatchObject({
      needsReview: true,
      summary: '结论：竞品 A 领先',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });
    expect(settled.reservedTokens).toBe(0);
    // v2.21 M3：分支事件按 created → started → status → returned 落 session_events
    const eventTypes = (
      ctx.db
        .prepare(`SELECT type FROM session_events WHERE scope = 'branch' AND scope_id = ? ORDER BY seq ASC`)
        .all(branch.id) as Array<{ type: string }>
    ).map((row) => row.type);
    expect(eventTypes).toEqual([
      'branch_created',
      'branch_started',
      'branch_status',
      'branch_returned',
    ]);
  });

  it('失败隔离：只标记当前分支 failed，父/子会话仍可打开', async () => {
    const service = createBranchService(ctx.deps, {
      runner: runnerOf([
        { event: 'error', data: { code: 'PROVIDER_ERROR', message: '上游超时' } },
      ]),
    });
    const { branch, childConversationId } = service.create(ctx.parentId, {
      goal: '调研',
      autoStart: true,
    });
    await service.whenSettled(branch.id);
    expect(service.get(branch.id)).toMatchObject({
      status: 'failed',
      statusReason: '上游超时',
    });
    expect(createConversationRepository(ctx.db).findById(childConversationId)).toBeTruthy();
    expect(service.list(ctx.parentId)).toHaveLength(1);
  });

  it('子节点上限：设置项生效，超限拒绝派生', () => {
    createSettingsRepository(ctx.db).setJson('app-settings', { branchMaxChildren: 1 });
    const service = createBranchService(ctx.deps);
    service.create(ctx.parentId, { goal: '第一个' });
    expect(() => service.create(ctx.parentId, { goal: '第二个' })).toThrow(/父会话分支数已达上限/);
  });

  it('删除只删关联，子会话保留；归档默认过滤', () => {
    const service = createBranchService(ctx.deps);
    const { branch, childConversationId } = service.create(ctx.parentId, { goal: '整理竞品' });
    service.archive(branch.id);
    expect(service.list(ctx.parentId)).toHaveLength(0);
    expect(service.list(ctx.parentId, true)).toHaveLength(1);
    service.remove(branch.id);
    expect(service.get.bind(service, branch.id)).toThrow();
    expect(createConversationRepository(ctx.db).findById(childConversationId)).toBeTruthy();
  });

  it('v2.21 M4：重启收敛把 running/waiting 改为 interrupted 并释放预留', () => {
    const service = createBranchService(ctx.deps);
    const running = service.create(ctx.parentId, { goal: '运行中' }).branch;
    const waiting = service.create(ctx.parentId, { goal: '等待中' }).branch;
    ctx.db
      .prepare(`UPDATE conversation_branches SET status = 'running', reserved_tokens = 1000 WHERE id = ?`)
      .run(running.id);
    ctx.db
      .prepare(`UPDATE conversation_branches SET status = 'waiting', reserved_tokens = 500 WHERE id = ?`)
      .run(waiting.id);

    expect(service.recoverInterrupted()).toBe(2);
    for (const branch of [running, waiting]) {
      expect(service.get(branch.id)).toMatchObject({
        status: 'interrupted',
        reservedTokens: 0,
        statusReason: '进程重启，分支已中断',
      });
    }
    const statusEvents = ctx.db
      .prepare(
        `SELECT COUNT(*) AS count FROM session_events WHERE scope = 'branch' AND type = 'branch_status'`,
      )
      .get() as { count: number };
    expect(statusEvents.count).toBe(2);
    // v2.22：中断终态也写回传，父会话可区分中断与失败
    const returned = ctx.db
      .prepare(
        `SELECT COUNT(*) AS count FROM session_events WHERE scope = 'branch' AND type = 'branch_returned'`,
      )
      .get() as { count: number };
    expect(returned.count).toBe(2);
    for (const branch of [running, waiting]) {
      expect(service.get(branch.id)?.evidence).toMatchObject({
        status: 'interrupted',
        summary: '',
        needsReview: true,
      });
    }
  });

  it('v2.22：排队取消写回传（无运行结果），且运行器不产生 waiting', async () => {
    const service = createBranchService(ctx.deps, {
      runner: runnerOf([
        { event: 'done', data: { content: '完成', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } } },
      ]),
    });
    const queued = service.create(ctx.parentId, { goal: '排队取消' }).branch;
    service.cancel(queued.id);
    const cancelled = service.get(queued.id);
    expect(cancelled).toMatchObject({ status: 'cancelled', reservedTokens: 0 });
    expect(cancelled.evidence).toMatchObject({
      status: 'cancelled',
      summary: '',
      usage: null,
      needsReview: true,
    });
    const eventTypes = (
      ctx.db
        .prepare(`SELECT type FROM session_events WHERE scope = 'branch' AND scope_id = ? ORDER BY seq ASC`)
        .all(queued.id) as Array<{ type: string }>
    ).map((row) => row.type);
    expect(eventTypes).toEqual(['branch_created', 'branch_status', 'branch_returned']);

    // 守卫：本版没有任何写入路径会把分支置为 waiting
    const run = service.create(ctx.parentId, { goal: '运行完成' }).branch;
    service.start(run.id);
    await service.whenSettled(run.id);
    expect(service.get(run.id)?.status).toBe('succeeded');
    expect(service.get(run.id)?.status).not.toBe('waiting');
  });

  it('v2.22：结算超预算改判 budget_exceeded 并释放预留', async () => {
    createSettingsRepository(ctx.db).setJson('app-settings', { branchTokenBudget: 10000 });
    const runner: BranchChatRunner = async function* (input) {
      // 模拟真实编排器：运行时把用量落到子会话消息，finalize 才能读到已用 Token
      ctx.db
        .prepare(
          `INSERT INTO messages(id, conversation_id, role, content, total_tokens, created_at)
           VALUES ('m-budget', ?, 'assistant', '', 9500, 't')`,
        )
        .run(input.conversationId);
      yield {
        event: 'done',
        data: { content: '内容已达预算', usage: { promptTokens: 9000, completionTokens: 500, totalTokens: 9500 } },
      } as never;
    };
    const service = createBranchService(ctx.deps, { runner });
    const { branch } = service.create(ctx.parentId, { goal: '触发熔断', autoStart: true });
    await service.whenSettled(branch.id);
    const settled = service.get(branch.id);
    expect(settled).toMatchObject({ status: 'budget_exceeded', reservedTokens: 0 });
    expect(settled.statusReason).toMatch(/Token 超限/);
    expect(settled.evidence).toMatchObject({ status: 'budget_exceeded', needsReview: true });
    const returned = ctx.db
      .prepare(
        `SELECT COUNT(*) AS count FROM session_events WHERE scope = 'branch' AND scope_id = ? AND type = 'branch_returned'`,
      )
      .get(branch.id) as { count: number };
    expect(returned.count).toBe(1);
  });

  it('终态不可回 running：cancelled 分支不能再次启动', () => {
    const service = createBranchService(ctx.deps);
    const branch = service.create(ctx.parentId, { goal: '不再启动' }).branch;
    service.cancel(branch.id);
    expect(service.get(branch.id)?.status).toBe('cancelled');
    expect(() => service.start(branch.id)).toThrow(/不可启动/);
  });

  it('证据产物：从子会话 toolTrace 提取并按 attachmentId 去重', () => {
    const artifact = {
      attachmentId: 'att-1',
      title: '调研报告',
      filename: 'report.md',
      format: 'markdown' as const,
      mimeType: 'text/markdown',
      byteSize: 128,
    };
    const messages = {
      listByConversation: () => [
        { toolTrace: [{ artifacts: [artifact] }, { artifacts: [artifact] }] },
        { toolTrace: [{ artifacts: [{ ...artifact, attachmentId: 'att-2', title: '附录' }] }] },
      ],
    };
    expect(collectBranchArtifacts(messages as never, 'child')).toEqual([
      { id: 'att-1', title: '调研报告', kind: 'markdown' },
      { id: 'att-2', title: '附录', kind: 'markdown' },
    ]);
  });
});
