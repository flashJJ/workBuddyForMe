# SSE 连接就是运行本身：登记/执行两段式、人工挂起时序与终态回放

一个跑到一半需要人点「通过」的流程，执行上下文必须能被第二次 HTTP 请求找到；一个已经结束的运行，也得能被重新打开查看。这篇讲我们桌面 AI 工作流引擎在 HTTP 层的生命周期设计：POST 只登记、SSE 订阅才执行、断线即取消、终态可回放，以及一个曾经让审核永久挂死的致命时序。

## 一次试运行在 HTTP 层发生了什么

用户在画布上点「试运行」、填好入参、点开始，浏览器和服务器之间不是一次请求，而是两次：

```text
① POST /api/flows/:id/runs          { input: { topic: '周报' } }
   ← 201 { runId }                    只做两件事：校验图、插一条 queued 记录

② GET  /api/flows/runs/:id/events    （EventSource，长连接）
   → event: flow  run_started
   → event: flow  node_started / node_succeeded / node_waiting_human ...
   → event: flow  run_succeeded      服务端关闭流
```

为什么不直接让 POST 一边执行一边流式返回（multipart 或 POST + SSE 响应体）？这个拆分继承自桌面任务功能、被真实使用验证过，它解决了三个问题：

1. **人工节点需要反向请求。** 流程跑到 human 节点挂起，用户点「通过」是一次独立的 `POST /runs/:id/human`。如果执行上下文只活在 POST 请求的协程里，第二次请求根本找不到它。先有 runId（资源），再有 events（订阅），挂起状态就有了可以被外部寻址的句柄；
2. **终态运行需要能被重新打开。** 用户关掉面板再回来，run 已结束，没有事件流可订阅了——这时 GET events 直接从落库的 node_executions **回放**一条完整事件流（见文末）；
3. **前端交互更简单。** 一个拿 runId 的普通 POST + 一个标准 EventSource，不用在 POST 响应体上搞流式解析，也不用处理「请求体还没发完响应就来了」的别扭时序。

---

## 服务端：createRun 与 startEvents 必须是两个方法

对应到 run-service 的接口设计：

```ts
interface FlowRunService {
  createRun(params): string;          // 仅登记 queued（校验图 + 建记录），不执行
  startEvents(runId, clientSignal?): // 订阅并驱动执行；同一 run 只允许一个订阅
    { runId, events: AsyncGenerator<FlowEventPayload> };
  submitHuman(runId, nodeId, body): boolean;
  submitToolConfirmation(runId, nodeId, allowed): boolean;
  cancel(runId): boolean;
}
```

startEvents 的状态机：

| run 当前状态 | startEvents 行为 |
|---|---|
| queued 且无活跃订阅 | 启动执行，返回事件生成器（同时在内存 active 表登记 AbortController） |
| 活跃中（已有订阅） | 409：同一运行只允许一个订阅者（否则两个连接竞争消费同一个生成器） |
| 已终态 | 409：不经过本方法，路由直接从仓储读记录做回放 |

路由层把「客户端断连」翻译成执行取消：`startEvents(runId, request.signal)`，引擎的 signal 与客户端 signal 用 `AbortSignal.any` 合并。浏览器一关 EventSource → request.signal abort → 引擎收敛 run_cancelled → active 表删除该 run → 运行级工具授权 grant 一并清理。**没有心跳、没有租约续约、没有僵尸运行回收器**——生命周期就是连接本身，这是本地单用户应用最诚实的模型。

---

## 人工挂起：一个键值等待注册表，和它的致命时序

挂起能力抽象成一个极简的内存注册表（`wait-registry.ts`），人工节点和危险工具门控共用，key 加前缀区分：

```ts
const humanKey = (runId, nodeId) => `${runId}:human:${nodeId}`;
const toolKey  = (runId, nodeId) => `${runId}:tool:${nodeId}`;

request(key, signal): Promise<unknown>   // 注册挂起项，返回等待 Promise
resolve(key, payload): boolean           // 提交结果；键不存在/已结束 → false
```

request 的实现里有一条整个工作流模块最容易写错、也确实在桌面任务阶段踩过的时序：

```ts
// ✅ 正确：Promise executor 同步注册挂起项
function runHumanNode() {
  const pending = ctx.requestHuman(nodeId);   // 同步写入 pending Map
  yield { type: 'node_waiting_human', nodeId }; // 然后才发事件
  return await pending;
}
```

为什么顺序不能反过来？`yield` 把事件交给路由写进 SSE 响应、冲给浏览器；浏览器收到事件渲染审核按钮；用户（或自动化测试）可以在同一个事件循环 tick 里立刻点下「通过」→ POST /human → `resolve(key)`。如果事件先发、Promise 后注册，这次 resolve 就会命中「键不存在」返回 false，然后 request 才把键挂上——**审核结果永远送达不了，运行挂死**。Promise 的 executor 是同步执行的，利用这一点保证「外部世界看到挂起事件时，接收结果的坑位已经挖好」。

注册表还内建了 abort 处理：signal 触发时自动以 undefined resolve，调用方统一按「拒绝」解释（人工驳回/断线/无交互环境归一为 `{ approved: false }`，流程可以经后续 condition 走驳回路径）。不设超时——试运行中人工去喝杯咖啡回来再批是合法场景。

对话触发（trigger=chat）则完全不挂起：startEvents 路径传 `interactive: run.trigger === 'manual'`，chat 路径恒为 false，requestHuman 返回 null，await 立即得到拒绝结果。同一份引擎代码，交互性只由这一个布尔位切换。

---

## 事件不只推给前端：同一条流喂三个消费者

run-service 内部把引擎的「裸」生成器包了一层：

```ts
const inner = runFlow(compiled, { ...context, signal });
const store = createFlowRunStore(runs);   // 消费者 1：落库
return (async function* () {
  try {
    for await (const event of inner) {
      store.persist(event);               // 节点开始/结束 upsert node_executions；run 状态迁移
      yield event;                        // 消费者 2：SSE 输出
    }
  } finally {
    active.delete(runId);
    deps.taskGrants?.clear(runId);        // 清理本次运行的工具临时授权
  }
})();
```

消费者 3 是对话路径：同一事件流在 `invokeFromChat` 里被映射成工具子步骤（流程回到对话一篇详述）。引擎不认识任何一个消费者——这正是「事件即唯一输出通道」的红利：试运行看 SSE、数据库看落库、对话看子步骤，是对同一条 AsyncGenerator 的三种投影。

落库与下发严格同序（先 persist 再 yield），所以即使进程在 yield 后崩溃，数据库里最坏情况只是「节点已完成但前端没收到事件」，绝不会出现「前端显示成功但数据库没记录」——前者刷新后靠回放自愈，后者无法自愈。

---

## 终态回放：已结束的运行也要能打开

GET events 路由的第一段是状态判断：

```ts
if (run.status !== 'queued' && !flowRunner.isActive(id)) {
  // 终态：从 node_executions 构造一条「伪实时」事件流
  for (const node of repo.listNodeExecutions(id)) {
    enqueue(node.status === 'skipped' ? node_skipped : node_succeeded, ...);
  }
  enqueue(run.status === 'succeeded' ? run_succeeded : run_failed/run_cancelled, ...);
  return 流式响应;
}
// queued：正常 startEvents 驱动
```

回放不是简单读 run.output——试运行面板的时间线需要逐节点状态，而 node_executions 在执行时已逐行落好。回放让「刷新页面后再看上次运行」和「正在看实时运行」走同一套前端渲染代码，前端甚至不需要区分这是实时流还是回放流（除了一个语义：回放流没有 node_waiting_human，挂起态不可能终态化）。

这个设计也暴露了当前的边界并接受它：**queued 但进程已重启的运行无法恢复执行**（active 表是内存的，引擎栈帧丢了）。run 行停在 queued，只能重新发起。跨进程恢复 / 失败节点单点重跑明确留给后续服务化版本，随独立 runner 一起做。现在把 run 和 node_executions 先行落库，正是为那天准备的数据基础。

---

## 前端 EventSource：两个真机调试出来的坑

后端协议没问题不代表前端能一次跑对，画布联调在 EventSource 上栽了两个跟头，都已固化为代码：

**坑 1：终态自动重连风暴。** EventSource 的默认行为是连接断开后自动重连。终态时服务端正常关闭流，浏览器立刻重连 → 路由判定「终态」→ 回放完整事件 → 关闭 → 再重连……实测单次运行刷出 32 条连接，时间线被回放事件灌出几十组重复行。修复：收到 run_succeeded/failed/cancelled 后**客户端主动 `es.close()`**，从源头终止重连。

**坑 2：回放事件去重。** 即使主动关流，网络边界情况下仍可能收到重复帧。状态归一函数按 `事件type:nodeId` 做幂等键（run 级事件按 type），同一节点同一状态只入列一次：

```ts
const key = 'nodeId' in payload ? `${payload.type}:${payload.nodeId}` : payload.type;
if (seen.has(key)) return;
```

这两条加上后，每次运行在 Network 面板里严格只有 1 条 events 连接，时间线每个节点恰好一组行——复测时专门核对过。

另外一个开发环境特有的坑值得提：Next dev 的按需编译/HMR 会重置模块级单例，SSE 连接持有的 flowRunner 和稍后 POST /human 命中的可能不是同一个实例（审核 422「没有等待中的审核」）。修复是把服务容器额外挂到 globalThis，生产模式无此问题，但本地调试不处理会严重干扰判断「到底是代码 bug 还是热更新幻觉」。

---

## 取消与授权：复用既有的门控资产

工具节点遇上 write/danger 权限时，引擎不重造门控，而是调 run-service 装配好的两个回调：

```ts
checkToolAllowed: (name, permission) =>
  permissions.isAllowed(name, permission, 'all') || taskGrants.isGranted(name, runId),
requestToolConfirmation: (req) => waiters.request(toolKey(runId, req.nodeId), signal)
    .then(allowed => { if (allowed) taskGrants.grant(req.toolName, runId); return allowed; }),
```

试运行里点「允许执行」授权只在本次运行内有效（task grant 以 runId 为作用域），run 结束的 finally 里随 active 清理一并 clear——不污染全局「始终允许」记忆，符合试运行「一次性、可审计」的定位。

---

## 小结

- POST 登记 + GET 订阅两段式，让运行成为可被外部请求寻址和重放的资源；
- 生命周期 = SSE 连接：断线即 abort，不搞心跳租约和僵尸回收，契合本地单用户模型；
- 挂起注册表的致命时序「先注册 Promise 再发事件」是 HITL 正确性底线；manual 交互、chat 非交互由一个布尔位切换；
- 一条引擎事件流同时喂落库、SSE、对话子步骤三个消费者；先落库后下发保证崩溃可自愈；
- 终态运行从 node_executions 回放，前端实时/回放渲染同构；queued 跨进程恢复明确留给服务化版本；
- 真机踩出的 EventSource 关流与去重两个坑已固化；工具授权复用既有门控，试运行授权随 run 清理。

后端讲到这里，下一篇转到前端：@xyflow/react 受控画布怎么落地——7 类自定义节点、条件分支的双句柄彩色边、拖拽建图，以及诊断如何在节点和边上发光。
