# 急停：一个停止信号怎么穿透 LLM 调用、工具执行和确认弹窗

「让任务停下来」有两种语义。**暂停**是循环挂起、状态保留、随时可以继续，一个 `control.state = 'paused'` 标志加一个 `waitIfPaused()` 等待点就能实现；**停止**是终态退出——中间状态全部清理、键鼠工具冻结、授权撤销。

停止难得多，因为它必须穿透所有**正在执行**的操作。在我们的桌面 AI 助手里：模型可能正在等 LLM 返回，工具可能正在执行（mouse_click 已经发出去了），HITL 弹窗可能正在等用户确认——停止信号要在所有这些挂起点上都生效。最终用的是三条独立通道：

1. **AbortSignal**：贯穿 LLM 调用、工具执行、HITL 等待；
2. **TaskLoopControl 状态标志**：循环每轮检查 `control.state === 'stopped'`；
3. **taskGrants 清理**：急停时撤销所有任务级授权，防止急停后残留授权被复用。

## 端到端链路

```text
用户按 Ctrl+Alt+Esc
    │
    ▼
desktop 主进程 globalShortcut 回调
    │
    ▼
triggerEmergencyStop()
    ├─ 打包态：POST {managedServer.url}/api/tasks/stop-all  (header: Authorization: Bearer {token})
    └─ dev 态：POST http://127.0.0.1:3000/api/tasks/stop-all  (无 token)
    │ dev server 未启动 → 静默忽略（不报错）
    ▼
web server POST /api/tasks/stop-all
    │
    ▼
taskRunner.stopAll()
    │
    ├─ 遍历 active map 的所有 run
    │   ├─ control.stop()  → control.state = 'stopped'
    │   └─ signal?.dispatchEvent(new Event('abort'))
    │
    └─ taskGrants.clearAll()  → 撤销所有任务级授权
    ▼
task-loop 检测到停止
    ├─ 循环顶部检查：control.state==='stopped' → finalize('stopped', 'user_stop')
    ├─ 观察/决策/执行中：signal.aborted → catch 分支 → finalize('stopped', 'user_stop')
    └─ HITL 等待中：pending-confirmations 拒绝 → gateToolPermission 返回 deny → 循环终止
    ▼
repo.updateRunStatus(runId, 'stopped', 'user_stop')
    │ taskGrants.clear(runId)
    ▼
yield run_finished 事件 → SSE 推给前端 → 前端更新 UI「已急停」
```

## dev 模式与打包模式的不同路径

急停的 HTTP 调用在两种运行方式下走不同路径：

**打包模式**：

- web server 由主进程 fork，地址是 `managedServer.url`（随机端口）；
- 鉴权 token 由主进程生成（环境变量 `APP_SERVER_TOKEN`），写在 web server 的启动环境里；
- 主进程同时知道 url 和 token，可以直接调用。

**dev 模式**：

- web server 是独立启动的 `next dev`（端口 3000），主进程不 fork；
- 没有 token（dev 模式跳过 token 校验）；
- 主进程调 `http://127.0.0.1:3000/api/tasks/stop-all`；
- 如果 dev server 没启动（只跑了 desktop dev），请求失败 → 静默忽略，不弹错误。

这样急停在两种模式下都能工作，且 dev 模式的「无 token」不影响安全性——它本来就是本地开发用的。

## stop-all 必须幂等

`POST /api/tasks/stop-all` 是**幂等**的：

- 没有活跃任务时，返回 `{ stopped: 0 }`（200，不是 404）；
- 有活跃任务时，返回 `{ stopped: N }`（N 是被停止的任务数）；
- 重复调用不会报错，第二次返回 `{ stopped: 0 }`。

幂等性很重要：急停热键可能被连按多次——如果第二次返回 404，用户会以为急停没生效。即使没有循环在跑，按热键也必须是一次成功的空操作。

## AbortSignal 怎么贯穿所有挂起点

AbortSignal 是急停能穿透所有挂起点的关键：

```ts
// toolCtx.signal 贯穿所有工具调用
const toolCtx: ToolContext = {
  signal,  // 来自 taskRunner.start 的 signal
  knowledgeBaseId: null,
  visionCapable,
  retrieve: async () => [],
};

// LLM 决策
decision = await planner.decide({ goal, steps, observation, allowedTools }, signal);

// 工具执行
const result = await executeToolCall(resolved.tool, args, ctx);  // ctx.signal 传入

// HITL 等待
const gate = yield* gateToolPermission({ ..., signal });
```

每个挂起点都检查 `signal.aborted`：

- **LLM 调用**：fetch 的 `signal` 选项，abort 时 fetch 抛 AbortError；
- **工具执行**：长耗时工具（如 screen_snapshot 的截图编码）定期检查 `signal.aborted`；
- **HITL 等待**：`pending-confirmations` 的 Promise 在 signal abort 时 reject。

**关键点**：signal 的 abort 由 `taskRunner.stopAll` 主动 dispatch，不能只依赖 request.signal。web server 的 request.signal 只在 SSE 连接断开时 abort，而急停热键是在**连接还在**的时候触发的——必须手动派发 abort 事件。

## 键鼠工具的冻结：急停的物理边界

急停不仅要终止循环，还要**冻结键鼠工具**，防止循环终止后，已发出的键鼠动作还在执行队列里。

具体做法：

1. `taskRunner.stopAll` 调 `control.stop()`，循环在下一步入口终止；
2. 正在执行的键鼠工具（如 mouse_move 动画）检查 `signal.aborted` 后中断；
3. **已发出的 mouse_click 无法撤回**（鼠标已经点下去了）——这是物理限制，无法避免；
4. 急停后 `taskGrants.clearAll()` 撤销所有授权，新的键鼠工具调用会被 HITL 拦截（任务级授权已经没了）。

第 3 点就是急停的物理边界：**急停能阻止「未来的动作」，不能撤回「已经发生的动作」**。这也是键鼠动作有「点击前 300ms 延迟 + 指示圈」的原因——在动作真正发生之前给急停留一个反应窗口。

## 前端控制条

任务模式 UI 的控制条（`apps/web/src/features/tasks/task-control-bar.tsx`）：

```text
┌─────────────────────────────────────────────────────┐
│ [暂停] [继续] [终止]              急停：Ctrl+Alt+Esc │
└─────────────────────────────────────────────────────┘
```

- **暂停/继续**：调 `POST /api/tasks/:id/control { action: 'pause'|'resume' }`；
- **终止**：调 `POST /api/tasks/:id/control { action: 'stop' }`；
- **急停提示**：右下角常驻「急停：Ctrl+Alt+Esc」，提醒用户有全局热键。

按钮按 `run.status` 启用/禁用：running 时暂停加终止可用，paused 时继续加终止可用，终态时全部禁用。

## 测试与验证

急停的测试覆盖：

- **stop-all 幂等**：无活跃任务时返回 `{ stopped: 0 }`；
- **急停终止循环**：control.stop() 后循环以 user_stop 退出；
- **taskGrants 清理**：急停后任务级授权被撤销；
- **dev server 未启动静默忽略**：triggerEmergencyStop 在 fetch 失败时不抛错。

手测：启动一个长任务（如「打开记事本慢慢打字」）→ 按 Ctrl+Alt+Esc → 任务立即停止，键盘输入中断。

## 收尾

急停用「**Ctrl+Alt+Esc 全局热键 → stop-all HTTP → control.stop + AbortSignal + taskGrants 清理**」三条通道，确保停止信号穿透所有挂起点。核心洞察是「**急停比暂停难，因为它要穿透正在执行的操作**」——AbortSignal 贯穿 LLM/工具/HITL 是关键，而「点击前 300ms 延迟 + 指示圈」是在物理边界（已发出的动作无法撤回）之前给急停留的反应窗口。

下一篇讲行动日志：task_runs/task_steps 两张表怎么设计、SSE 事件与落库的一致性怎么保证，以及刷新页面后终态任务如何完整回放。
