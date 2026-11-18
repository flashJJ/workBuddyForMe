import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../client';
import { createAgentRunRepository } from './agent-run-repo';
import { createTaskRunCheckpointRepository } from './task-run-checkpoint-repo';

function seedRun() {
  const db = createDatabase(':memory:');
  db.prepare(
    "INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a1','测试助手','t','t')",
  ).run();
  const run = createAgentRunRepository(db).create({ assistantId: 'a1', goal: 'g' });
  return { db, run };
}

const usage = { round: 0, steps: 2, promptTokens: 10, completionTokens: 5, totalTokens: 15 };

describe('task_run_checkpoints 仓储', () => {
  it('upsert 同一 run 只保留一行，并可按 run 读取最新阶段', () => {
    const { db, run } = seedRun();
    const repo = createTaskRunCheckpointRepository(db);

    repo.upsert({ agentRunId: run.id, roundNo: 0, phase: 'executing', usage });
    repo.upsert({
      agentRunId: run.id,
      roundNo: 0,
      phase: 'reviewing',
      subtask: { title: '子任务', brief: '说明', acceptance: ['标准'] },
      outcome: { summary: '完成', evidence: [], toolCalls: [], unfinished: [] },
      usage: { ...usage, steps: 4 },
    });

    const checkpoint = repo.getByRunId(run.id)!;
    expect(checkpoint.phase).toBe('reviewing');
    expect(checkpoint.subtask?.title).toBe('子任务');
    expect(checkpoint.outcome?.summary).toBe('完成');
    expect(checkpoint.usage.steps).toBe(4);
    expect(repo.listResumable()).toHaveLength(1);
    db.close();
  });

  it('markNotResumable 后不再出现在可续跑列表，运行视图 resumable=false', () => {
    const { db, run } = seedRun();
    const repo = createTaskRunCheckpointRepository(db);
    repo.upsert({ agentRunId: run.id, roundNo: 0, phase: 'executing', usage });
    expect(createAgentRunRepository(db).getById(run.id)?.resumable).toBe(true);

    repo.markNotResumable(run.id, '已终态');
    expect(repo.listResumable()).toHaveLength(0);
    expect(createAgentRunRepository(db).getById(run.id)?.resumable).toBe(false);
    db.close();
  });
});
