# 队列、事件总线与崩溃恢复：把执行权从 SSE 连接手里收回来

v0.8 的工作流执行有个说不硬气的设计：执行的生命周期等于 SSE 连接的生命周期。`POST /runs` 只写一条 queued 记录，前端的 EventSource 连上之后引擎才启动，断开就 abort，人工审批也靠这条连接挂着。这个范式在「人盯着画布调试」时很简单，但一旦要做服务化就全是窟窿：外部 HTTP 请求等不住长连接，进程重启后 running 行变僵尸，排队中的任务没人捡。

v0.9 把它换成了一套经典但克制的三件套：**单执行者队列 + 进程内事件总线 + 启动恢复扫描**。本文讲设计取舍和两个真实踩到的坑。

## 信号可以丢，DB 认领才是权责

第一版队列长这样（伪代码）：

```ts
function enqueue(runId) {
  pending.push(runId);
  schedule(); // setImmediate 通知拾取循环
}
```

内存信号在单进程里通常够用，但它有两个失效窗口：Next dev 按需编译时模块被重新求值（信号数组变成新的空数组），以及 tick 链在冷编译期间被延迟。我们在 M2 联调时真的遇到了：run 已经 queued 落库，但没有任何拾取发生，要等下一次 enqueue 才带动它。

有两个选择：把信号做成持久队列（重），或者承认信号只做加速、**用数据库状态作为唯一权责来源**。选了后者：

```ts
claim: (runId) =>
  runs.claimQueued(runId) ? runs.getRun(runId) : null,
```

`claimQueued` 是一条原子更新：

```sql
UPDATE workflow_runs SET status='running', started_at=@now
WHERE id=@id AND status='queued'
```

变更行数为 1 才算抢到。这样即使内存里把同一个 runId 信号发了十次（补偿扫描 + createRun + HMR 重放），也只有一次认领成功，**重复信号在数学上不可能导致双跑**。

再加一个 5 秒的补偿定时器：扫一遍 DB 里仍是 queued 且本进程没在执行的 run，重新 enqueue。丢信号的窗口被兜住，最坏延迟 5 秒，对本地应用完全可以接受。

后来还补了一处：claim 本身也可能抛异常（测试里 DB 提前关闭时遇到过），异常沿 setImmediate 链浮成 unhandled rejection。tick 里对 claim 单独 try/catch，认领失败当这一拍跳过，等补偿扫描。

## 串行执行者：v1 明确不并发

拾取循环是一条串行链：

```ts
async function tick(runId) {
  const run = claim(runId);           // DB 原子认领
  if (!run) return;
  inFlight.add(runId);
  try { await execute(run); }
  catch (e) { onError(runId, e); }
  finally { inFlight.delete(runId); schedule(); }
}
```

一个 run 跑完才安排下一个。这是方案里写死的约束：本地桌面应用串行执行最安全（LLM/工具都是共享的下游资源），单进程也不需要分布式锁。并发是明确的 v0.9+ 候选，而不是这一版偷偷做一半的东西。

## EventBus：观察者是平等的，而且只读

执行和观察分离之后，所有观察者都接到同一个总线：

```ts
bus.publish(runId, event);
bus.subscribe(runId, listener);   // 多订阅者
bus.snapshot(runId);              // 迟到者先补缓冲
```

实现要点：

- 每个 run 一个事件缓冲，订阅时把缓冲**同步**补发一遍再接实时，避免「订阅建立的瞬间漏掉早期事件」；
- 总线不做重试、不做持久化——它只是内存里的扇出；历史真相在 `node_executions` 表里；
- 订阅是只读的。画布关掉、外部 curl 断开，执行都不受影响。

「两个观察者看到逐字一致的事件序列」是我们的验收条件之一：同一条 run 的事件流被订阅两次（模拟重开面板），两边按序收到的事件完全相同；之后再查 run，状态依然是 succeeded。

订阅侧还有个小工具 `waitForRunTerminal`：总线事件为主、定时查 DB 兜底，带超时。HTTP 同步调用和 MCP tools/call 都用它等结果——纯等待者，不占用执行者。

## 恢复扫描：进程的遗嘱

启动时扫一次全表：

```text
status in (running, waiting_human) 且没有本进程执行者
  → markInterrupted(reason='process_restart')
status = queued
  → 重新入队
```

两个语义判断：

1. **running 必须收敛**。原执行者已经随旧进程死了，不可能有结果回来，停在 running 是对「现在能不能观察到结果」的永久撒谎。标成 interrupted 之后，用户能在运行记录里明确看到原因，并选择重跑/重放。
2. **waiting_human 也按中断处理**。旧进程的内存 waiter 一起死了，外部重连无法再提交审批。v1 保守收敛，UI 不挂内联操作（API 运行本来也不挂人）。24h TTL 兜底留给 v0.10 常驻端。

queued 的 run 则直接重新入队——它们一行节点都没执行过，续跑没有任何副作用。

## 一个分层上的小原则

队列、总线、恢复扫描都不认识「流程」「工具」「HTTP」。它们只认识 runId、状态和事件载荷。具体的编译、门控、落库是 `execute(run)` 注入进去的。这个边界让三件套可以被纯内存/临时库直接单测（队列 7 例、事件总线多观察者、恢复扫描收敛+续跑），不需要起 Next、不需要 HTTP。

下一篇讲对外的第一道门：端点密钥是怎么生成、存储和校验的，以及为什么错密钥要回 404 而不是 401。
