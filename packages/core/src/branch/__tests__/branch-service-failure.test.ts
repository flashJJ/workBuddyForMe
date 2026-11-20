import { describe, expect, it } from 'vitest';
import { createDatabase } from '@wbfm/database';
import type { ServiceDeps } from '../../services/base/deps';
import { createBranchService } from '../branch-service';

const cipher = {
  encrypt: (value: string) => value,
  decrypt: (value: string) => value,
};

describe('分支运行异常收敛', () => {
  it('终态落账异常不产生未处理拒绝', async () => {
    const db = createDatabase(':memory:');
    db.prepare(
      `INSERT INTO assistants(id, name, created_at, updated_at) VALUES ('a1','A','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO conversations(id, assistant_id, title, created_at, updated_at)
       VALUES ('p1','a1','父会话','t','t')`,
    ).run();
    const deps = { db, cipher } as unknown as ServiceDeps;

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let ticked = false;
    const service = createBranchService(deps, {
      runner: async function* () {
        await gate;
        ticked = true;
        yield { event: 'done', data: { content: 'x', usage: null } } as never;
      },
    });
    service.create('p1', { goal: '异常落账', autoStart: true });
    db.close(); // 落账阶段 DB 不可用
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ticked).toBe(true);
  });
});
