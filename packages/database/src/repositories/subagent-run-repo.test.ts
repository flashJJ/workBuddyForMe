import { describe, expect, it } from 'vitest';
import { createDatabase } from '../client';
import { createSubagentRunRepository } from './subagent-run-repo';

describe('v2.11 外部代理运行仓储', () => {
  it('创建 → 启动 → 终态 → 列表', () => {
    const db = createDatabase(':memory:');
    const repo = createSubagentRunRepository(db);

    const run = repo.create({
      providerId: 'local-cli',
      goal: '整理目录',
      cwd: 'C:\\work',
      conversationId: 'c1',
    });
    expect(run.status).toBe('queued');
    expect(run.startedAt).toBeNull();
    expect(run.endedAt).toBeNull();

    repo.markStarted(run.id);
    const running = repo.get(run.id)!;
    expect(running.status).toBe('running');
    expect(running.startedAt).toBeTruthy();

    const done = repo.finish(run.id, {
      status: 'done',
      summary: '完成',
      outputBytes: 12,
    })!;
    expect(done.status).toBe('done');
    expect(done.summary).toBe('完成');
    expect(done.outputBytes).toBe(12);
    expect(done.endedAt).toBeTruthy();

    const second = repo.create({
      providerId: 'local-cli',
      goal: '第二条',
      cwd: 'C:\\work',
      conversationId: null,
    });
    expect(repo.list(2)).toHaveLength(2);
    expect(repo.list(1)).toHaveLength(1);
    expect(repo.list(1)[0]!.id).toBe(second.id);
    expect(repo.get('missing')).toBeNull();
    db.close();
  });
});
