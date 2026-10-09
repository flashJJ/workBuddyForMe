# 任务 Agent 循环：观察→决策→门控→执行，以及长任务的三道护栏

对话页那套工具调用循环是「一问一答」：模型输出 tool_calls → 执行 → 把结果喂回模型，直到它不再调工具。查知识库、抓网页这种短链路很合适，但「打开记事本 → 输入 → 保存」是多步、有状态的任务，它缺四样东西：

1. **没有跨轮的任务状态**：每轮 model call 之间没有「任务目标」的持久概念，模型可能中途忘了要干什么；
2. **没有步数上限**：模型可能死循环调用工具（比如反复抓同一个网页）；
3. **没有失败计数**：同一个工具连续失败 3 次，模型还会继续试；
4. **没有急停机制**：用户无法中途终止任务。

我们的桌面 AI 应用为此单独写了一个顶层状态机（`packages/core/src/agent/task-loop.ts`）。它不是对话循环的扩展，而是和对话并列的新骨架。

## 循环骨架

```text
┌──────────────────────────────────────────────────────────┐
│  TaskRunnerService.start(run)                            │
│  （run 已在 POST /api/tasks 时创建，status=queued）       │
└──────────────────────┬───────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────┐
│  run_task_loop (AsyncGenerator<TaskLoopEvent, TaskRunView>) │
│                                                          │
│  1. updateRunStatus(running)                             │
│  2. yield run_started                                    │
│                                                          │
│  loop:                                                   │
│    ┌─ 检查急停（signal.aborted / control.state==='stopped'） │
│    │     → finalize('stopped', 'user_stop')              │
│    ├─ 检查暂停（control.state==='paused'）                │
│    │     → yield run_paused → waitIfPaused()             │
│    │                                                      │
│    ├─ 观察：screen_snapshot（截图 + UIA 清单）             │
│    │     → repo.addStep(observe) + finishStep             │
│    │     → 失败则 consecutiveFailures++，检查上限         │
│    │                                                      │
│    ├─ 决策：planner.decide({ goal, steps, observation }) │
│    │     → { action: 'tool'|'done'|'fail', tool, args }  │
│    │                                                      │
│    ├─ action==='done' → finalize('completed')            │
│    ├─ action==='fail' → finalize('failed', 'error')      │
│    │                                                      │
│    ├─ 工具动作：                                           │
│    │   ├─ resolveTool(toolName) + allowedTools 白名单     │
│    │   ├─ 熔断器检查（isTripped → 任务终止）              │
│    │   ├─ HITL 权限门控（gateToolPermission）             │
│    │   ├─ executeToolCall → result                        │
│    │   └─ breakers.recordResult(toolName, result.ok)     │
│    │                                                      │
│    └─ 检查上限：                                          │
│        ├─ run.stepCount >= run.maxSteps → 'stopped','max_steps' │
│        └─ consecutiveFailures >= TASK_MAX_FAILURES → 'failed','max_failures' │
└──────────────────────────────────────────────────────────┘
```

循环是一个 AsyncGenerator，每一步 yield 一个 `TaskLoopEvent`（`run_started` / `step_started` / `step_finished` / `run_paused` / `run_resumed` / `run_finished`），web server 的 SSE /events 路由直接消费这些事件推给前端。

## 三道安全护栏

### 护栏一：步数上限 + 连续失败上限

```ts
// packages/shared/src/constants.ts
export const TASK_MAX_STEPS = 20;        // 单任务最多 20 步
export const TASK_MAX_FAILURES = 3;      // 连续失败 3 次终止
```

- **步数上限**：防失控。20 步对「打开记事本写一句话保存」绰绰有余（约 5-8 步）；对复杂任务可能不够，但 20 步是「安全优先」的取舍——用户随时可以启动新任务继续。
- **连续失败上限**：防死循环。同一个工具连续失败 3 次（观察失败 / 工具执行失败 / 决策失败），任务自动终止。注意是**连续**失败，不是总失败数——中间有一步成功就清零。

### 护栏二：熔断器联动

既有的工具熔断器（`tool-breaker.ts`）状态机：closed → open（连续失败 3 次 trip）→ half-open（5 分钟冷却后放行一次）。

任务循环与熔断器联动：**目标工具已熔断时，任务直接终止**，而不是跳过该工具继续。因为核心工具（比如 screen_snapshot）一旦熔断，任务就无法继续观察——硬撑只会浪费步数。

```ts
if (deps.breakers?.isTripped(toolName)) {
  repo.finishStep(actionStep.id, {
    status: 'failed',
    error: `工具 ${toolName} 已熔断，任务终止`,
  });
  const fin = finalize('failed', 'breaker');
  yield fin.event;
  return fin.run;
}
```

### 护栏三：急停热键 + AbortSignal

全局急停热键 `Ctrl+Alt+Esc`（desktop 主进程用 `globalShortcut` 注册）触发后：

1. 主进程调 web server 的 `POST /api/tasks/stop-all`；
2. `TaskRunnerService.stopAll()` 遍历所有活跃 run，调 `control.stop()`；
3. 循环的 `control.state === 'stopped'` 分支触发，`finalize('stopped', 'user_stop')`；
4. 同时清理所有 `taskGrants`（任务级授权）。

另外，SSE 客户端断线时 `request.signal` 自动 abort，循环检测到 `signal.aborted` 也以 `user_stop` 终态退出——**不会出现「客户端关了但任务还在跑」的孤儿循环**。

## 循环的生命周期归 SSE 连接所有

一个关键架构决策：**循环的生命周期由 SSE /events 拥有，不是 POST 创建时启动**。

```text
POST /api/tasks
    → createRun({ status: 'queued' })  // 只创建，不启动循环
    → 201 返回 run

GET /api/tasks/:id/events  (SSE)
    → run.status === 'queued'
        → resolveTaskLaunchArtifacts(planner, allowedTools, visionCapable)
        → taskRunner.start(run) → 消费 AsyncGenerator → sseResponse
    → run.status === 'running' (active)
        → 409 Conflict（同 runId 重复启动防护）
    → run.status === 终态
        → replayTerminalRun（回放已落库 steps + run_finished）
```

这样设计有三个好处：

1. **客户端断线即终止**：SSE 连接断 → request.signal abort → 循环 user_stop 退出，无需额外的心跳或租约机制；
2. **重复启动防护**：`taskRunner.start` 入口加 `active.has(runId)` 守卫，抛 409，防止 active map 被覆盖或产生孤儿生成器；
3. **终态可回放**：刷新页面时，/events 对终态 run 不启动新循环，而是把已落库 steps 包成 step_finished 事件、追加 run_finished 后关闭——前端能看到完整时间线。

## planner：循环的大脑

planner（`packages/core/src/agent/llm-planner.ts`）负责每一轮的决策：

- **输入**：`{ goal, steps: TaskStepView[], observation: TaskObservation, allowedTools }`
- **输出**：`{ action: 'tool'|'done'|'fail', tool?, args?, reason, message? }`
- **temperature=0**：决策需要确定性，不采样
- **maxTokens=1024**：控制决策输出长度

planner 的 system prompt 包含：任务目标、已执行步骤历史（含每步结果摘要，避免重复观察）、当前观察（截图摘要 + UIA 清单）、可用工具白名单、输出格式约束（JSON schema）。

visionCapable 校验放在 /events 启动前：`resolveTaskLaunchArtifacts` 检查模型 `capabilities.includes('vision')`，否则抛 422 引导用户切到 qwen2.5vl——**没有视觉能力的模型不能跑桌面任务**。

## 测试与验证

任务循环的测试（`task-loop.test.ts` 等 60+ 测）覆盖：

- **状态机**：queued → running → completed/failed/stopped 的转换；
- **步数上限**：maxSteps=1 时第一步后终止，stop_reason='max_steps'；
- **失败上限**：连续 3 次观察失败 → failed，stop_reason='max_failures'；
- **熔断联动**：工具已熔断 → 任务终止，stop_reason='breaker'；
- **急停**：control.stop() 后循环以 user_stop 退出；
- **暂停/继续**：control.pause() → run_paused → control.resume() → run_resumed；
- **重复启动防护**：同 runId 二次 start 抛 409。

## 收尾

任务 Agent 循环是「**观察→决策→门控→执行→再观察**」的状态机，用三道护栏（步数/失败双上限 + 熔断器联动 + 急停热键/AbortSignal）回答了「长任务怎么不失控」。核心架构决策是**循环生命周期由 SSE /events 拥有**——客户端断线即终止，无需额外心跳，且天然支持终态回放。

下一篇讲急停的完整链路：Ctrl+Alt+Esc 从主进程到 web server 再到循环终止的端到端流程，以及为什么「停止」比「暂停」难做得多。
