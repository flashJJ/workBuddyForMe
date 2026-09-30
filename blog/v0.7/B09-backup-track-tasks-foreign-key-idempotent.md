---
title: "备份轨加 tasks：task_runs/task_steps 纳入四轨体系，外键校验与幂等恢复"
series: "WorkBuddy For Me v0.7 技术拆解"
number: "B09"
tags: ["workbuddy", "backup", "tasks", "foreign-key", "idempotent", "tar-gz"]
date: "2026-09"
---

## 为什么 tasks 需要独立备份轨

v0.4 建立了四轨备份体系：conversations / knowledge / settings / attachments。v0.6 加了 skills 轨（技能文件夹 + 启停状态）。v0.7 的桌面任务（task_runs + task_steps）是新的数据类型，需要纳入备份。

tasks 轨的特殊性：

1. **外键依赖**：task_runs 依赖 conversations 和 assistants（FK），恢复时必须确保外键存在；
2. **明细量大**：一个 run 可能有 20 个 step，每个 step 有 result_json/args_json，序列化体积大；
3. **截图引用**：step.screenshot_path 是附件 id，随 attachments 轨独立恢复。

---

## 备份轨架构回顾

v0.4 的备份格式是 `.tar.gz` 归档，包含：

```text
manifest.json
conversations.json
knowledge.json
settings.json
attachments.json
attachments/xxx.png  (二进制)
skills.json          (v0.6)
tasks.json           (v0.7)
```

manifest 描述各轨的元数据（文件数、条目数、字节数）。每个轨是独立的 JSON 文件，恢复时按轨选择导入。

**向前兼容**：旧归档（v0.4/v0.5/v0.6）没有 tasks 键，恢复时 `manifest.tracks.tasks` 为 undefined，precheck 返回 `tasks: 0`，determineTracks 不包含 tasks——**旧归档在 v0.7 上恢复不报错**。

---

## tasks 轨的导出

`packages/core/src/backup/export-tasks-track.ts` 的 `serializeTasksTrack`：

```ts
const runs = repo.listAllRuns(10_000);
const serialized = runs.map((run) => ({
  run: { id, conversationId, assistantId, goal, status, stepCount, ... },
  steps: repo.listSteps(run.id).map((s) => ({
    id, runId, stepIndex, kind, toolName, reason, argsJson, resultJson,
    screenshotPath, status, error, durationMs, createdAt,
  })),
}));
files['tasks.json'] = JSON.stringify(serialized, null, 2);
manifestPartial.tasks = { files: 'tasks.json', entryCount: runs.length };
```

**设计点**：

- `listAllRuns(10_000)`：限制最大 10000 个 run，防止极端用户的归档过大；
- `entryCount` 是 run 数量，不是 step 数量（与 conversations 轨的 entryCount 语义一致）；
- `screenshotPath` 只存附件 id，不存截图二进制（截图随 attachments 轨）；
- `resultJson` / `argsJson` 原样导出（DB 里已经截断到 4000 字符）。

---

## tasks 轨的恢复

`packages/core/src/backup/restore-ops.ts` 的 `restoreTasks`：

```ts
export function restoreTasks(db, entries: TaskTrackEntry[]) {
  const convExists = db.prepare(`SELECT 1 FROM conversations WHERE id = ?`);
  const assistantExists = db.prepare(`SELECT 1 FROM assistants WHERE id = ?`);
  const runExists = db.prepare(`SELECT 1 FROM task_runs WHERE id = ?`);
  const insertRun = db.prepare(`INSERT OR IGNORE INTO task_runs ...`);
  const insertStep = db.prepare(`INSERT OR IGNORE INTO task_steps ...`);

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
    insertRun.run(...);
    imported++;
    for (const s of entry.steps) insertStep.run(...);
  }
  return { imported, skipped };
}
```

**三个关键设计**：

### 1. 外键校验在应用层，不靠 DB FK 约束

SQLite 的 `INSERT OR IGNORE` 不忽略外键约束冲突——如果 conversation_id 不存在，INSERT 会抛错而不是静默跳过。所以必须在应用层先检查 `convExists` 和 `assistantExists`，不满足就 skip。

这与 v0.4 conversations 轨的恢复逻辑一致（conversations 也依赖 assistants FK）。

### 2. 幂等跳过

`INSERT OR IGNORE` + `runExists` 双重检查：

- `INSERT OR IGNORE`：run id 已存在则跳过（不报错）；
- `runExists`：显式检查，统计 skipped 计数。

为什么双重？因为 `INSERT OR IGNORE` 的 `changes` 是 0，但 better-sqlite3 的 `run()` 返回的 `changes` 对 `INSERT OR IGNORE` 的行为依赖 SQLite 版本——显式检查更可靠。

### 3. step 跟随 run 导入

如果 run 被 skip（外键不存在或已存在），它的 steps 也不导入。如果 run 被导入，steps 用 `INSERT OR IGNORE` 逐个导入（step id 全局唯一，已存在则跳过）。

**不单独恢复 steps**：steps 的 run_id FK 依赖 task_runs，如果 run 不存在，step 插入会 FK 冲突。所以 steps 必须跟随 run 导入，不能独立恢复。

---

## 与 conversations 轨的依赖关系

tasks 轨恢复依赖 conversations 轨（因为 task_runs.conversation_id FK）。恢复顺序：

```ts
// restore.ts 的事务内顺序
restoreSettings(db, files.get('settings.json'));
restoreKnowledge(db, files.get('knowledge.json'));
restoreConversations(db, files.get('conversations.json'));  // 先恢复 conversations
restoreAttachmentsMeta(db, files.get('attachments.json'));
restoreSkillsState(db, skillsPayload.states);
restoreTasks(db, taskPayload);  // 后恢复 tasks，依赖 conversations 已存在
```

如果用户只选 tasks 轨恢复（不选 conversations），而目标库没有对应的 conversation，tasks 会被全部 skip——这是预期行为，toast 会显示「跳过 N 任务（会话/助手不存在）」。

---

## UI 集成

`apps/web/src/features/settings/backup-panel.tsx`：

- TRACK_OPTIONS 加「任务记录」项（默认勾选）；
- 恢复 toast 显示 tasks 导入/跳过计数；
- 跳过提示：「N 任务（已存在或会话/助手不存在）」。

---

## 测试

`packages/core/src/backup/restore-tasks.test.ts`：

1. **roundtrip**：导出 tasks + conversations → 恢复 → run 和 step 数量一致；
2. **幂等跳过**：同归档恢复两次，第二次 imported=0, skipped=1；
3. **外键跳过**：孤儿 task_run（conversation_id 不存在）→ imported=0, skipped=1。

`packages/core/src/backup/export.test.ts`：tasks 轨序列化断言（run 字段 + step 字段完整）。

---

## 一句话总结

v0.7 的 tasks 备份轨复用 v0.4 的四轨体系，核心设计是「**外键校验在应用层 + INSERT OR IGNORE 幂等 + step 跟随 run 导入**」。与 v0.6 skills 轨的设计哲学一致：**向前兼容（旧归档无 tasks 键不报错）、幂等恢复（重复恢复不覆盖）、外键安全（不满足则跳过）**。tasks 轨的加入让桌面 Agent 的行动日志也能跨机器迁移，完成了 v0.4「数据随身」主题在 v0.7 的延伸。

下一篇 B10 是 v0.7 复盘：从选型到门禁的全链路总结，以及给 v0.8 铺的路。
