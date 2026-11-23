# 把任务记录纳入备份：外键校验放在应用层，恢复天然幂等

桌面任务的行动日志（task_runs + task_steps）是一类新数据，也要能随备份包跨机器迁移。它比其他数据麻烦在三点：run 以外键依赖会话和助手、一个 run 最多带 20 个 step 导致明细量大、截图以附件 id 引用而不是内嵌。

我们的桌面 AI 应用很早就有一套多轨备份体系：最初是 conversations / knowledge / settings / attachments 四轨，后来加入了 skills 轨（技能文件夹加启停状态）。任务记录作为 tasks 轨纳入，复用同一套归档格式与恢复语义。这篇讲这一轨的导出、恢复和轨间依赖。

## 备份格式与向前兼容

备份包是一个 `.tar.gz` 归档，结构如下：

```text
manifest.json
conversations.json
knowledge.json
settings.json
attachments.json
attachments/xxx.png  (二进制)
skills.json          (后加)
tasks.json           (任务轨)
```

manifest 描述各轨的元数据（文件数、条目数、字节数）。每个轨是独立的 JSON 文件，恢复时按轨选择导入。

**向前兼容**：更早版本的归档没有 tasks 键，恢复时 `manifest.tracks.tasks` 为 undefined，precheck 返回 `tasks: 0`，determineTracks 不包含 tasks——**旧归档在新版上恢复不报错**。

## tasks 轨怎么导出

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

- `listAllRuns(10_000)`：最多导出 10000 个 run，防止极端用户的归档过大；
- `entryCount` 是 run 数量，不是 step 数量（与 conversations 轨的 entryCount 语义一致）；
- `screenshotPath` 只存附件 id，不存截图二进制（截图随 attachments 轨走）；
- `resultJson` / `argsJson` 原样导出（DB 里已经截断到 4000 字符）。

## 恢复的三个关键设计

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

### 1. 外键校验在应用层，不靠 DB FK 约束

SQLite 的 `INSERT OR IGNORE` 并不忽略外键约束冲突——如果 conversation_id 不存在，INSERT 会抛错而不是静默跳过。所以必须在应用层先查 `convExists` 和 `assistantExists`，不满足就 skip。

这与 conversations 轨当初的恢复逻辑一致（conversations 也依赖 assistants 外键）。

### 2. 幂等跳过：INSERT OR IGNORE 之外再显式查一次

`INSERT OR IGNORE` 加 `runExists` 是双重检查：

- `INSERT OR IGNORE`：run id 已存在则跳过（不报错）；
- `runExists`：显式检查，用于统计 skipped 计数。

为什么要双重？`INSERT OR IGNORE` 命中冲突时 `changes` 是 0，但 better-sqlite3 的 `run()` 返回的 `changes` 在 `INSERT OR IGNORE` 下的行为依赖 SQLite 版本——显式查一次更可靠。

### 3. step 跟随 run 导入，不能单独恢复

如果 run 被 skip（外键不存在或已存在），它的 steps 也不导入；如果 run 被导入，steps 用 `INSERT OR IGNORE` 逐个导入（step id 全局唯一，已存在则跳过）。

**不存在「单独恢复 steps」**：steps 的 run_id 外键依赖 task_runs，run 不存在时 step 插入会触发外键冲突。所以 steps 必须跟随 run 导入。

## 轨间恢复顺序

tasks 轨恢复依赖 conversations 轨（task_runs.conversation_id 外键）。事务内的恢复顺序是：

```ts
// restore.ts 的事务内顺序
restoreSettings(db, files.get('settings.json'));
restoreKnowledge(db, files.get('knowledge.json'));
restoreConversations(db, files.get('conversations.json'));  // 先恢复 conversations
restoreAttachmentsMeta(db, files.get('attachments.json'));
restoreSkillsState(db, skillsPayload.states);
restoreTasks(db, taskPayload);  // 后恢复 tasks，依赖 conversations 已存在
```

如果用户只勾选 tasks 轨恢复（不选 conversations），而目标库没有对应的 conversation，tasks 会被全部 skip——这是预期行为，toast 会提示「跳过 N 任务（会话/助手不存在）」。

## UI 集成

`apps/web/src/features/settings/backup-panel.tsx`：

- TRACK_OPTIONS 加「任务记录」项（默认勾选）；
- 恢复 toast 显示 tasks 导入/跳过计数；
- 跳过提示：「N 任务（已存在或会话/助手不存在）」。

## 测试

`packages/core/src/backup/restore-tasks.test.ts` 三个用例：

1. **roundtrip**：导出 tasks + conversations → 恢复 → run 和 step 数量一致；
2. **幂等跳过**：同一归档恢复两次，第二次 imported=0, skipped=1；
3. **外键跳过**：孤儿 task_run（conversation_id 不存在）→ imported=0, skipped=1。

`packages/core/src/backup/export.test.ts` 断言 tasks 轨序列化结果（run 字段 + step 字段完整）。

## 收尾

tasks 备份轨复用既有的多轨体系，核心设计是「**外键校验在应用层 + INSERT OR IGNORE 幂等 + step 跟随 run 导入**」，与 skills 轨的设计哲学一致：**向前兼容（旧归档无 tasks 键不报错）、幂等恢复（重复恢复不覆盖）、外键安全（不满足则跳过）**。这一轨让桌面 Agent 的行动日志也能跨机器迁移，把「数据随身」延伸到了任务记录。

下一篇是复盘：从选型到门禁的全链路总结，哪些结论后来仍然成立，以及这一轮给后续工作铺了什么路。
