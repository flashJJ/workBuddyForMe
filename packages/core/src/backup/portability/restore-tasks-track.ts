/**
 * v0.7 M4：任务轨（task_runs / task_steps）恢复。
 * v2.32 从 restore-ops 拆出以通过 300 行门禁；协作运行关联字段随条目回填。
 */

/** v0.7 M4：任务轨归档负载条目（run + steps） */
export interface TaskTrackEntry {
  run: {
    id: string;
    conversationId: string;
    assistantId: string;
    goal: string;
    status: string;
    stepCount: number;
    failureCount: number;
    maxSteps: number;
    stopReason: string | null;
    createdAt: string;
    updatedAt: string;
    finishedAt: string | null;
    /** v2.32：协作运行关联（v7 归档缺省） */
    agentRunId?: string | null;
  };
  steps: Array<{
    id: string;
    runId: string;
    stepIndex: number;
    kind: string;
    toolName: string | null;
    reason: string;
    argsJson: string;
    resultJson: string;
    screenshotPath: string;
    status: string;
    error: string;
    durationMs: number;
    createdAt: string;
    /** v2.32：步骤级协作运行关联（v7 归档缺省） */
    agentRunId?: string | null;
  }>;
}

/**
 * task_runs / task_steps：INSERT OR IGNORE 幂等跳过（避免覆盖本机已有任务）。
 * 不重建会话/助手外键——如果 conversation/assistant 不存在，本条 run 跳过。
 */
export function restoreTasks(db: any, entries: TaskTrackEntry[]): { imported: number; skipped: number } {
  const convExists = db.prepare(`SELECT 1 FROM conversations WHERE id = ?`);
  const assistantExists = db.prepare(`SELECT 1 FROM assistants WHERE id = ?`);
  const runExists = db.prepare(`SELECT 1 FROM task_runs WHERE id = ?`);
  const insertRun = db.prepare(
    `INSERT OR IGNORE INTO task_runs
       (id, conversation_id, assistant_id, goal, status, step_count, failure_count,
        max_steps, stop_reason, created_at, updated_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertStep = db.prepare(
    `INSERT OR IGNORE INTO task_steps
       (id, run_id, step_index, kind, tool_name, reason, args_json, result_json,
        screenshot_path, status, error, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let imported = 0, skipped = 0;
  for (const entry of entries) {
    const r = entry.run;
    // 外键校验：conversation 和 assistant 必须存在
    if (!convExists.get(r.conversationId) || !assistantExists.get(r.assistantId)) {
      skipped++;
      continue;
    }
    if (runExists.get(r.id)) {
      skipped++;
      continue;
    }
    insertRun.run(
      r.id, r.conversationId, r.assistantId, r.goal, r.status,
      r.stepCount, r.failureCount, r.maxSteps, r.stopReason,
      r.createdAt, r.updatedAt, r.finishedAt,
    );
    imported++;
    for (const s of entry.steps) {
      insertStep.run(
        s.id, s.runId, s.stepIndex, s.kind, s.toolName,
        s.reason, s.argsJson, s.resultJson, s.screenshotPath,
        s.status, s.error, s.durationMs, s.createdAt,
      );
    }
  }
  return { imported, skipped };
}
