import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, createConversationRepository, createSettingsRepository } from '@wbfm/database';
import type { ServiceDeps } from '../services/base/deps';
import { createBranchService } from './branch-service';
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
  });
});
