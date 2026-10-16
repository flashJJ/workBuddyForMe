import { describe, expect, it } from 'vitest';
import { createDatabase } from '../client';
import { createRelationshipMilestoneRepository } from './relationship-milestone-repo';

function seed(db: ReturnType<typeof createDatabase>): void {
  db.prepare(
    `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a1','助手','t','t')`,
  ).run();
}

describe('relationship-milestone-repo（v2.0 M2）', () => {
  it('achieve 幂等：首次写入返回记录，重复键返回 null 且不覆盖 achievedAt', () => {
    const db = createDatabase();
    seed(db);
    const repo = createRelationshipMilestoneRepository(db);
    const first = repo.achieve({
      assistantId: 'a1',
      milestoneKey: 'day_1',
      achievedAt: '2026-10-15T08:00:00.000Z',
      payload: { sceneId: 'ev.milestone.day1' },
    });
    expect(first).toMatchObject({
      assistantId: 'a1',
      milestoneKey: 'day_1',
      payload: { sceneId: 'ev.milestone.day1' },
    });
    const again = repo.achieve({
      assistantId: 'a1',
      milestoneKey: 'day_1',
      achievedAt: '2026-10-16T08:00:00.000Z',
    });
    expect(again).toBeNull();
    expect(repo.findByAssistant('a1')).toHaveLength(1);
    expect(repo.findByAssistant('a1')[0]!.achievedAt).toBe('2026-10-15T08:00:00.000Z');
    db.close();
  });

  it('findByAssistant 按达成时间正序；不同助手隔离', () => {
    const db = createDatabase();
    seed(db);
    db.prepare(
      `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a2','二','t','t')`,
    ).run();
    const repo = createRelationshipMilestoneRepository(db);
    repo.achieve({ assistantId: 'a1', milestoneKey: 'day_30', achievedAt: '2026-11-14T00:00:00.000Z' });
    repo.achieve({ assistantId: 'a1', milestoneKey: 'day_1', achievedAt: '2026-10-15T00:00:00.000Z' });
    repo.achieve({ assistantId: 'a2', milestoneKey: 'day_1', achievedAt: '2026-10-20T00:00:00.000Z' });

    const a1 = repo.findByAssistant('a1').map((m) => m.milestoneKey);
    expect(a1).toEqual(['day_1', 'day_30']);
    expect(repo.findByAssistant('a2').map((m) => m.milestoneKey)).toEqual(['day_1']);
    expect(repo.listAll()).toHaveLength(3);
    db.close();
  });

  it('deleteByAssistant 只清该助手；统计只读 emotion_events/agent_runs', () => {
    const db = createDatabase();
    seed(db);
    const repo = createRelationshipMilestoneRepository(db);
    repo.achieve({ assistantId: 'a1', milestoneKey: 'day_1', achievedAt: '2026-10-15T00:00:00.000Z' });
    expect(repo.deleteByAssistant('a1')).toBe(1);
    expect(repo.deleteByAssistant('a1')).toBe(0);

    // 统计：正向事件取最早一条（level_up/down 不计），协作只数 done
    const now = '2026-10-15T08:00:00.000Z';
    db.prepare(
      `INSERT INTO conversations(id,assistant_id,created_at,updated_at) VALUES('c1','a1',?,?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO emotion_events(id,assistant_id,type,source,emotion,intensity,message_id,created_at)
       VALUES('e1','a1','belittle','model',NULL,0.3,NULL,?)`,
    ).run('2026-10-14T00:00:00.000Z');
    db.prepare(
      `INSERT INTO emotion_events(id,assistant_id,type,source,emotion,intensity,message_id,created_at)
       VALUES('e2','a1','level_up','system',NULL,1,NULL,?)`,
    ).run('2026-10-14T12:00:00.000Z');
    db.prepare(
      `INSERT INTO emotion_events(id,assistant_id,type,source,emotion,intensity,message_id,created_at)
       VALUES('e3','a1','praise','model',NULL,0.8,NULL,?)`,
    ).run('2026-10-15T09:00:00.000Z');
    for (const [id, status] of [
      ['r1', 'done'],
      ['r2', 'done'],
      ['r3', 'failed'],
    ] as const) {
      db.prepare(
        `INSERT INTO agent_runs(id,assistant_id,goal,status,round_no,max_rounds,max_steps,
          max_total_tokens,created_at,updated_at)
         VALUES(?, 'a1', 'g', ?, 0, 1, 1, 1, ?, ?)`,
      ).run(id, status, now, now);
    }
    const stats = repo.statsFor('a1');
    expect(stats.firstPositiveEventAt).toBe('2026-10-15T09:00:00.000Z');
    expect(stats.collabDoneCount).toBe(2);
    // 从未互动的助手：空统计
    expect(repo.statsFor('ghost')).toEqual({ firstPositiveEventAt: null, collabDoneCount: 0 });
    db.close();
  });

  it('非法 key/时间的损坏行被跳过；payload 坏 JSON 宽容回退空对象', () => {
    const db = createDatabase();
    seed(db);
    const repo = createRelationshipMilestoneRepository(db);
    repo.achieve({ assistantId: 'a1', milestoneKey: 'day_1', achievedAt: '2026-10-15T00:00:00.000Z' });
    // 非法 milestoneKey（大写不匹配封闭正则）→ 行被跳过
    db.prepare(
      `INSERT INTO relationship_milestones(id,assistant_id,milestone_key,achieved_at,payload_json)
       VALUES('x-bad','a1','BAD-KEY','2026-11-14T00:00:00.000Z','{}')`,
    ).run();
    // payload 坏 JSON 不影响行有效性（宽容回退 {}，与其他仓储一致）
    db.prepare(
      `INSERT INTO relationship_milestones(id,assistant_id,milestone_key,achieved_at,payload_json)
       VALUES('x-fragile','a1','day_30','2026-11-14T00:00:00.000Z','not-json{')`,
    ).run();
    const rows = repo.findByAssistant('a1');
    expect(rows.map((m) => m.milestoneKey)).toEqual(['day_1', 'day_30']);
    expect(rows.find((m) => m.milestoneKey === 'day_30')!.payload).toEqual({});
    db.close();
  });
});
