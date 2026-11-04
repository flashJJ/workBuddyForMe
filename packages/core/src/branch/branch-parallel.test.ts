import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, createConversationRepository, createMessageRepository, createSettingsRepository } from '@wbfm/database';
import type { ServiceDeps } from '../services/base/deps';
import type { BranchChatRunner } from './branch-runner';
import { createBranchService } from './branch-service';

const cipher = { encrypt: (value: string) => value, decrypt: (value: string) => value };

interface Gate {
  release: () => void;
  fail: (error: Error) => void;
}

/** 手动放行的 runner：用于证明两个分支同时进入 running、一个失败不影响另一个 */
function gatedRunner(): { runner: BranchChatRunner; gates: Gate[] } {
  const gates: Gate[] = [];
  const runner: BranchChatRunner = async function* (input) {
    let release!: () => void;
    let reject!: (error: Error) => void;
    const wait = new Promise<void>((resolve, rejectFn) => {
      release = resolve;
      reject = rejectFn;
    });
    gates.push({ release, fail: reject });
    await wait;
    yield {
      event: 'done',
      data: {
        content: `完成：${input.content}`,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      },
    } as never;
  };
  return { runner, gates };
}

function setup() {
  const db = createDatabase(':memory:');
  db.prepare(
    `INSERT INTO assistants(id, name, created_at, updated_at) VALUES ('a1', 'A', 't', 't')`,
  ).run();
  db.prepare(
    `INSERT INTO conversations(id, assistant_id, title, created_at, updated_at)
     VALUES ('p1', 'a1', '父会话', 't', 't')`,
  ).run();
  return { db, deps: { db, cipher } as unknown as ServiceDeps };
}

describe('v2.21 分支并行（M4）', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('两个分支同时 running；单分支失败不影响另一个；预留结算归零', async () => {
    const { runner, gates } = gatedRunner();
    const service = createBranchService(ctx.deps, { runner });
    const first = service.create('p1', { goal: '分支 A', autoStart: true }).branch;
    const second = service.create('p1', { goal: '分支 B', autoStart: true }).branch;

    // 两个分支都已进入 running，证明并行而非串行等待
    expect(service.get(first.id)?.status).toBe('running');
    expect(service.get(second.id)?.status).toBe('running');
    expect(service.budget('p1').reservedTokens).toBe(2000);

    gates[0]!.release();
    await service.whenSettled(first.id);
    expect(service.get(first.id)).toMatchObject({ status: 'succeeded', reservedTokens: 0 });
    expect(service.get(first.id)?.evidence?.summary).toContain('完成：分支 A');
    // 另一个仍在运行，未被失败/成功串扰
    expect(service.get(second.id)?.status).toBe('running');

    gates[1]!.fail(new Error('上游超时'));
    await service.whenSettled(second.id);
    expect(service.get(second.id)).toMatchObject({
      status: 'failed',
      statusReason: '上游超时',
      reservedTokens: 0,
    });

    // 父会话转录不插入回传消息
    const parentMessages = createMessageRepository(ctx.db).listByConversation('p1');
    expect(parentMessages).toHaveLength(0);
    expect(service.budget('p1')).toMatchObject({ reservedTokens: 0, usedTokens: 0 });
    expect(createConversationRepository(ctx.db).findById('p1')?.title).toBe('父会话');
  });

  it('预算触顶：预留耗尽后拒绝新的启动', () => {
    createSettingsRepository(ctx.db).setJson('app-settings', { branchTokenBudget: 10000 });
    const service = createBranchService(ctx.deps, { runner: gatedRunner().runner });
    service.create('p1', { goal: 'A', autoStart: true });
    service.create('p1', { goal: 'B', autoStart: true });
    const third = service.create('p1', { goal: 'C' }).branch;
    // 人工占满会话树预留：10000 已预留 + 10000 上限 → 无法再预留 1000
    ctx.db
      .prepare(`UPDATE conversation_branches SET reserved_tokens = 10000 WHERE id = ?`)
      .run(third.id);
    expect(() => service.start(third.id)).toThrow(/Token 预算已用尽/);
  });
});
