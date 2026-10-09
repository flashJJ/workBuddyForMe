# 行动日志：任务每一步先落库再推事件，刷新页面也能完整回放

对话消息落库是为了历史可回看；任务落库是为了**行动可审计**。桌面操作是有副作用的——助手点了哪、输入了什么、为什么这么决策——用户事后需要能一步步回放。

我们的桌面 AI 应用把行动日志分成两层：task_runs 记录一次任务运行（目标、状态、停止原因），task_steps 记录任务中的每一步（观察/动作/最终决策）。对话版原有的工具调用日志只记录「单轮工具调用」，没有「任务」这个聚合维度。这篇讲两张表怎么设计、实时事件怎么和落库保持一致、终态任务怎么回放。

## 两层结构：task_runs 聚合，task_steps 明细

建表迁移在 `packages/database/src/migrations/v011-task-runs.ts`。

### task_runs

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | run id |
| conversation_id | TEXT FK | 所属会话 |
| assistant_id | TEXT FK | 所属助手 |
| goal | TEXT | 任务目标（用户输入） |
| status | TEXT | queued/running/paused/completed/failed/stopped |
| step_count | INT | 已执行步数 |
| failure_count | INT | 失败步数 |
| max_steps | INT | 步数上限（默认 20） |
| stop_reason | TEXT | completed/max_steps/max_failures/breaker/user_stop/error |
| created_at / updated_at / finished_at | TEXT | 时间戳 |

### task_steps

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | step id |
| run_id | TEXT FK | 所属 run |
| step_index | INT | 步序号（1 开始） |
| kind | TEXT | observe/action/final |
| tool_name | TEXT | 动作步的工具名（观察步为 null） |
| reason | TEXT | 模型决策理由 |
| args_json | TEXT | 工具参数 JSON |
| result_json | TEXT | 工具结果 JSON（截断 4000 字符） |
| screenshot_path | TEXT | 观察步的截图附件 id |
| status | TEXT | running/completed/failed |
| error | TEXT | 失败原因 |
| duration_ms | INT | 该步耗时 |
| created_at | TEXT | 创建时间 |

**关键设计点**：

- `result_json` 截断到 4000 字符（UIA 控件清单等长输出防爆行），完整结果在附件或日志里；
- `screenshot_path` 存附件 id（不是路径），与 attachments 表关联；
- `step_index` 是任务内序号，不是全局 id——同一个 run 内唯一；
- `stop_reason` 是枚举而不是自由文本，便于统计和 UI 展示。

## 为什么先落库再发事件，还要从 DB 重读

任务循环的每一步都**先落库再发事件**，确保 SSE 断线后前端能从 DB 恢复状态：

```ts
// task-loop.ts 的 observe 步
const observeStep = repo.addStep({ runId, stepIndex, kind: 'observe', reason });
yield stepStarted(observeStep);           // 发 step_started 事件

const observation = await runObservation(...);
repo.finishStep(observeStep.id, {         // 先落库
  status: observation ? 'completed' : 'failed',
  resultJson: JSON.stringify({ summary: ... }),
  durationMs: Date.now() - obsStarted,
  screenshotPath: observation?.screenshotPath,
});

const finished = stepFinished(observeStep.id);  // 从 DB 重读最新 step
if (finished) yield finished;                   // 再发 step_finished 事件
```

**为什么从 DB 重读再发事件**：`finishStep` 可能一次更新了多个字段（status/resultJson/durationMs/screenshotPath），直接用内存对象可能漏掉某个字段。从 DB 重读保证事件内容与落库内容一致——**前端看到的就是 DB 存的**。

**事件类型**（`packages/shared/src/schemas/task.ts` 里的 TaskEventType）：

- `run_started`：循环启动；
- `step_started`：步骤开始（status=running）；
- `step_finished`：步骤完成（status=completed/failed）；
- `run_paused` / `run_resumed`：暂停/继续；
- `run_finished`：循环终态（completed/failed/stopped）。

所有事件都带 `run` 字段（最新的 run 视图），前端不需要再单独查 run 状态。

## 终态回放：实时和回放走同一套事件处理

刷新页面时，/events 路由对终态 run 不启动新循环，而是**回放已落库的 steps**：

```ts
// GET /api/tasks/:id/events
const run = repo.getRun(id);
if (!run) throw 404;

// 活跃 → 409（防重复订阅）
if (taskRunner.isActive(id)) throw ApiError.conflict('任务已在运行');

// 终态 → 回放
if (isTerminalStatus(run.status)) {
  return replayTerminalRun(run, repo.listSteps(id));
}

// queued → 启动循环
const artifacts = resolveTaskLaunchArtifacts(services, run);
const events = taskRunner.start({ run, ...artifacts, signal: request.signal });
return sseResponse(events);
```

`replayTerminalRun` 手写一个 ReadableStream，按顺序发出：

1. 每个 step 的 `step_started` + `step_finished`（从 DB 读，status 已是终态）；
2. 最后发 `run_finished`；
3. 关闭流。

前端的 `useTaskEvents` hook 用同一套 `applyEvent` 逻辑处理实时事件和回放事件——**前端不区分实时还是回放，统一处理事件流**。这是事件溯源风格的好处：状态变更全部用事件表示，回放就是重放事件。

## 循环生命周期归属带来的一致性

前面说过这个决策：循环的生命周期由 SSE /events 拥有，不是 POST 创建时启动。它对落库一致性有直接影响：

- POST /api/tasks 只创建 queued run，**不写任何 step**；
- 循环启动后才开始写 step；
- 客户端断线 → request.signal abort → 循环以 user_stop 终态退出 → run.finished_at 写入；
- 重连 /events → 检测到终态 → 回放 steps。

**好处**：不会出现「run 是 running 但没有任何 step」的僵尸状态——run 只有在循环启动后才变 running，而循环启动一定写第一个 observe step。

## 备份轨里的 tasks

任务记录也被加入备份轨（`packages/core/src/backup/export-tasks-track.ts`）：

- **导出**：`task_runs` + `task_steps` 全量序列化为 `tasks.json`；
- **恢复**：`INSERT OR IGNORE` 幂等跳过（避免覆盖本机已有任务）；
- **外键校验**：conversation 和 assistant 必须存在，否则跳过该 run；
- **截图**：`screenshot_path` 是附件 id，随 attachments 轨独立导出恢复。

tasks 轨 manifest 里的计数是 `entryCount`（run 数量，不是 step 数量），与 conversations 轨的 `entryCount`（对话数量）语义一致。

## 任务模式 UI 长什么样

任务页面（`apps/web/src/features/tasks/task-page.tsx`）：

```text
┌─────────────────────────────────────────────────────────┐
│ 桌面任务                                                 │
├─────────────────────────────────────────────────────────┤
│ [会话选择] [目标输入框] [maxSteps: 20] [开始]             │
├─────────────────────────────────────────────────────────┤
│ ▼ 今天 14:30  打开记事本写一句话保存          [completed]  │
│   ┌─ 步骤时间线 ─────────────────────────────────────┐   │
│   │ #1 observe  观察屏幕状态          100ms  [截图]    │   │
│   │ #2 action   app_launch notepad    200ms  ✅        │   │
│   │ #3 action   window_focus 记事本    50ms  ✅         │   │
│   │ #4 action   keyboard_type "你好"   80ms  ✅         │   │
│   │ #5 action   keyboard_press Ctrl+S  60ms  ✅         │   │
│   │ #6 final    任务完成                0ms   ✅         │   │
│   └────────────────────────────────────────────────────┘   │
│ ▶ 今天 14:25  打开浏览器搜索今天天气            [stopped]  │
└─────────────────────────────────────────────────────────┘
```

- **新任务 composer**：会话选择 + 目标输入 + maxSteps + 开始按钮；
- **任务列表**：每行可折叠/展开，展开显示步骤时间线；
- **步骤卡片**：步序号 + kind/status 徽章 + 工具名 + 决策理由 + args/result 折叠 + 截图缩略图 + 耗时；
- **控制条**：仅 active run 显示，暂停/继续/终止 + 急停提示。

步骤卡片复用了 chat 的 `AttachmentImage` 组件显示截图缩略图——观察步的截图附件直接渲染。

## 测试与验证

落库与回放的测试：

- **task-run-repo**：createRun / getRun / listRunsByConversation / listAllRuns / updateRunStatus / incrementRunCounters / addStep / finishStep / listSteps；
- **终态回放**：/events 对终态 run 返回 step_finished + run_finished，不启动新循环；
- **重复启动防护**：同 runId 二次 /events 返回 409；
- **备份 roundtrip**：tasks 轨导出→恢复，run 和 step 数量一致，幂等跳过正常。

## 收尾

行动日志用「**task_runs 聚合 + task_steps 明细**」两层结构记录桌面 Agent 的每一步，通过「**先落库再发事件 + 从 DB 重读发事件**」保证 SSE 与 DB 的一致性，并用「**终态回放**」让刷新页面也能看到完整时间线。核心洞察是「**事件溯源**」——所有状态变更用事件表示，实时推送和历史回放走同一套事件处理逻辑，前端无需区分。

下一篇讲一次「做完决定不做」的评估：为什么没有接入 playwright-mcp，以及这个决策背后的打包体积与投入产出权衡。
