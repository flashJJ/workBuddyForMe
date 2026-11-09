/**
 * v2.32 M2：恢复 tasks 轨内的协作运行与角色交接。
 * 顺序：agent_runs → agent_handoffs → 回填 task_runs/task_steps.agent_run_id。
 * 全部 INSERT OR IGNORE，重复恢复不产生重复行。
 */
import type { DatabaseInstance } from '@wbfm/database';
import type { AgentRunTrackEntry, AgentHandoffTrackEntry } from './export-agent-runs';
import type { TaskTrackEntry } from './restore-tasks-track';

/** agentRuns.json 负载（缺失/损坏按空数组降级，兼容 v7 归档） */
export function readAgentRunsPayload(raw: Buffer | undefined): AgentRunTrackEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw.toString('utf-8')) as unknown;
    return Array.isArray(parsed) ? (parsed as AgentRunTrackEntry[]) : [];
  } catch {
    return [];
  }
}

/** agentHandoffs.json 负载（缺失/损坏按空数组降级） */
export function readAgentHandoffsPayload(raw: Buffer | undefined): AgentHandoffTrackEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw.toString('utf-8')) as unknown;
    return Array.isArray(parsed) ? (parsed as AgentHandoffTrackEntry[]) : [];
  } catch {
    return [];
  }
}

interface Counts {
  imported: number;
  skipped: number;
}

/** 写入协作运行：会话/工作流外键不存在时置空，主键冲突跳过 */
export function restoreAgentRuns(db: DatabaseInstance, runs: AgentRunTrackEntry[]): Counts {
  const convExists = db.prepare('SELECT 1 FROM conversations WHERE id = ?');
  const flowExists = db.prepare('SELECT 1 FROM workflow_runs WHERE id = ?');
  const runExists = db.prepare('SELECT 1 FROM agent_runs WHERE id = ?');
  const insert = db.prepare(
    `INSERT OR IGNORE INTO agent_runs
       (id, conversation_id, flow_run_id, node_execution_id, assistant_id, goal, status,
        round_no, max_rounds, max_steps, max_total_tokens, final_outcome,
        prompt_tokens, completion_tokens, total_tokens, error_code, error_message,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let imported = 0;
  let skipped = 0;
  for (const run of runs) {
    if (runExists.get(run.id)) {
      skipped++;
      continue;
    }
    const conversationId = run.conversationId && convExists.get(run.conversationId) ? run.conversationId : null;
    const flowRunId = run.flowRunId && flowExists.get(run.flowRunId) ? run.flowRunId : null;
    insert.run(
      run.id, conversationId, flowRunId, run.nodeExecutionId, run.assistantId, run.goal, run.status,
      run.roundNo, run.maxRounds, run.maxSteps, run.maxTotalTokens, run.finalOutcome,
      run.promptTokens, run.completionTokens, run.totalTokens, run.errorCode, run.errorMessage,
      run.createdAt, run.updatedAt,
    );
    imported++;
  }
  return { imported, skipped };
}

/** 写入角色交接：所属运行不存在时跳过（含本次未导入的情况） */
export function restoreAgentHandoffs(db: DatabaseInstance, handoffs: AgentHandoffTrackEntry[]): Counts {
  const runExists = db.prepare('SELECT 1 FROM agent_runs WHERE id = ?');
  const handoffExists = db.prepare('SELECT 1 FROM agent_handoffs WHERE id = ?');
  const insert = db.prepare(
    `INSERT OR IGNORE INTO agent_handoffs
       (id, run_id, round_no, seq, from_role, to_role, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let imported = 0;
  let skipped = 0;
  for (const handoff of handoffs) {
    if (!runExists.get(handoff.runId) || handoffExists.get(handoff.id)) {
      skipped++;
      continue;
    }
    insert.run(
      handoff.id, handoff.runId, handoff.roundNo, handoff.seq,
      handoff.fromRole, handoff.toRole, handoff.payload, handoff.createdAt,
    );
    imported++;
  }
  return { imported, skipped };
}

/** 回填任务与步骤的 agent_run_id（仅当目标运行已存在） */
export function backfillTaskAgentRunIds(db: DatabaseInstance, entries: TaskTrackEntry[]): number {
  const runExists = db.prepare('SELECT 1 FROM agent_runs WHERE id = ?');
  const updateRun = db.prepare('UPDATE task_runs SET agent_run_id = ? WHERE id = ?');
  const updateStep = db.prepare('UPDATE task_steps SET agent_run_id = ? WHERE id = ?');
  let linked = 0;
  for (const entry of entries) {
    const runAgentId = entry.run.agentRunId;
    if (runAgentId && runExists.get(runAgentId)) {
      updateRun.run(runAgentId, entry.run.id);
      linked++;
    }
    for (const step of entry.steps) {
      if (step.agentRunId && runExists.get(step.agentRunId)) {
        updateStep.run(step.agentRunId, step.id);
      }
    }
  }
  return linked;
}
