# 画完怎么调：试运行面板的 SSE 状态机、内联人工审核与事件时间线

可视化流程工具最容易做成「画的时候很爽，跑的时候抓瞎」：点运行，转半天，最后弹个成功/失败，中间发生了什么全靠猜。这篇讲我们桌面 AI 工作流编辑器底部的试运行面板——怎么把 SSE 事件流组织成可调试的时间线，人工审核与危险工具授权怎样原地完成，以及两个真机踩出来的 EventSource 坑在 UI 侧的症状。

## 调试体验是 P0，不是附属功能

验收标准写得很具体：每个节点的状态/输入/输出/耗时可见，人工节点挂起后直接在面板里处理。这件事在路线图里被单列为最高优先级，而不是做完画布顺手补的附属功能。

最终的底部面板（试运行功能模块）由三块组成：

```text
┌─ 试运行 [运行中] run-7d7a  [取消运行] [×] ────────────────────┐
│ （挂起时）琥珀色内联卡片：审核说明 + [驳回] [通过]              │
│  时间线：开始 ● 成功 / 大模型 ● 运行中… / 结束 ○               │
│  （终态）最终输出区块 / 失败原因区块 + [重跑]                   │
└───────────────────────────────────────────────────────────────┘
```

---

## 一个 hook 收敛整个运行状态

订阅逻辑全部封在 `useFlowRunEvents(runId)` 里，对组件暴露一个状态对象：

```ts
interface FlowLiveState {
  events: FlowEventPayload[];                 // 原始事件序列（时间线数据源）
  nodeStatus: Record<string, FlowNodeExecStatus>; // nodeId → 状态（画布高亮复用）
  waitingNodeId: string | null;               // 当前挂起节点
  phase: 'connecting' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  connection: 'connecting' | 'open' | 'closed' | 'error';
  output: unknown;
  errorMessage: string | null;
  errorNodeId: string | null;
}
```

事件到状态的归一是一个纯函数 `applyFlowEvent(prev, event)`，每种事件只改它该改的字段：

```ts
case 'node_started':        nodeStatus[id] = 'running'; 等待态清除;
case 'node_succeeded':      nodeStatus[id] = 'succeeded';
case 'node_skipped':        nodeStatus[id] = 'skipped';
case 'node_waiting_human':  nodeStatus[id] = 'waiting_human'; waitingNodeId = id;
case 'node_failed':         nodeStatus[id] = 'failed';
case 'run_succeeded':       phase = 'succeeded'; output = e.output; 主动 es.close();
case 'run_failed':          phase = 'failed'; errorMessage = ...; 主动 es.close();
case 'run_cancelled':       phase = 'cancelled'; 主动 es.close();
```

**这个状态对象同时驱动两个地方**：画布的节点描边（通过画布一篇的 FlowStatusContext）和底部时间线。节点在画布上变绿和在时间线里打勾是同一份状态的两个视图，不存在「面板说成功、画布里还在转」的不一致。

EventSource 的生命周期严格绑 runId：runId 变（发起新运行）→ 清理重建；面板关闭 → es.close()。SSE 单订阅约束（服务端 409）在 UI 侧被进一步加强——`useFlowRunEvents` 在编辑器里只调用一次，状态通过 props 传给面板，避免面板重挂产生第二个订阅。

---

## 时间线：节点事件折叠成行，输入输出按需展开

原始事件流是「一个节点 2~3 条事件」（started/succeeded，可能还有 waiting_human）。时间线不直接渲染事件，而是过滤出节点级事件后逐事件成行——同一节点的 started 与 succeeded 是两行状态（「运行中」行随后被图标更新体现），展开区才显示数据：

```tsx
const hasDetail = ('inputs' in e && e.inputs !== undefined)
               || ('outputs' in e && e.outputs !== undefined)
               || ('reason' in e) || ('message' in e);
```

行首图标即时表达状态（Loader2 旋转/勾/跳过失活/X），右侧显示可选的 durationMs（引擎在 node_succeeded 事件上带）。点开后用 `<pre>` 折叠展示 JSON.stringify(indent=2) 的输入/输出，并限高滚动——完整 LLM 输出可能几千字，默认收起保护视线，需要排查时再展开。

为什么时间线直接用事件数组而不是再聚合成「节点 → 最终状态」结构？因为调试时**过程本身有意义**：waiting_human 行（「等待处理」）在 succeeded 之后仍保留在序列里，能看出「这个节点曾经挂过」；skipped 行带着 reason。聚合成最终状态会丢掉这些时序信息。原始事件 + 渲染层折叠，是最诚实的时间线。

---

## 挂起内联：人工审核与危险工具授权共用一个位置

`waitingNodeId` 非空时，时间线上方插入一张琥珀色卡片，按挂起节点类型渲染两种内容：

**human 节点**：显示节点配置里的审核说明（支持插值后的文本）+ [驳回] [通过]：

```tsx
POST /api/flows/runs/:id/human  { nodeId, approved, values: {} }
```

**write/danger 工具节点**：显示工具名与参数 JSON（让用户看清楚要放行什么）+ [拒绝] [允许执行]：

```tsx
POST /api/flows/runs/:id/tool-confirm  { nodeId, allowed }
```

关键体验是「原地继续」：提交后不关闭面板、不重连 SSE，只是挂起卡片消失，时间线继续往下滚——因为挂起协议里，提交结果 resolve 了引擎里等待的 Promise，**同一个 SSE 连接、同一个事件流**自然继续推送后续节点。用户感知是「我点了通过，流程就接着跑了」，而不是「提交表单→页面刷新→重新打开运行」。

真机验证过两条业务路径：start → human → end（end 绑定 approved 引用），点通过最终输出 `true`，点驳回最终输出 `false`。这一条链路同时验证了挂起/恢复、引用插值、类型保持（布尔不是字符串）三件事。

---

## 取消与重跑：终态操作的语义

运行中显示「取消运行」→ POST control `{action:'cancel'}` → 服务端 abort → run_cancelled。没有二次确认弹窗——试运行是低成本操作，且取消语义安全（不会产生半写入数据，流程本来就不落业务表，只有运行记录）。

终态后按钮变「重跑」：打开入参对话框并**预填上一次输入**（lastRunInput 存在编辑器 state 里）。一键复现是调试场景的刚需——改完一个节点配置，保存，重跑，对比两次时间线差异，整个循环不超过三次点击。

终态结果区按 phase 渲染：succeeded 显示绿色「最终输出」（字符串原样、其他类型 JSON 格式化，空输出显示「(空)」），failed 显示红色错误信息，cancelled 无结果区。

---

## 入参对话框：start 节点声明即表单

试运行开始前的输入表单不是另写一套字段定义，直接读当前图里 start 节点的 `inputs` 声明：

```ts
const fields = (nodes.find(n => n.type === 'start')?.data.config.inputs ?? []) as FlowInputField[];
// 按 type 渲染 string(text)/number(input number)/boolean(checkbox)
// required 留空时回退 default
```

这再次兑现图契约一篇说的「一份入参声明三处复用」：画布上定义 → 试运行表单 → 发布工具的 parameters schema。提交时按类型转换（number 字段转 Number、checkbox 转布尔、空值回落默认值），得到的对象就是 POST /runs 的 input，也成为引擎 scope 里 start 节点的 params。

---

## 两个真机踩坑在面板侧的表现

SSE 一篇已详述两个 EventSource 坑的协议层修复，这里记录它们在 UI 层最初的「症状」，因为排查这类问题时先看到的是现象：

**症状 1：一次运行时间线滚出几十组重复节点，甚至出现与真实结果矛盾的幻影行。** 根因是服务端终态关闭流 → 浏览器自动重连 → 服务端回放 → 再关 → 再连，32 次回放叠加。修复后（终态 es.close + `type:nodeId` 幂等去重），Network 里每次运行严格 1 条 events 连接，时间线每个节点恰好 started+succeeded 两行。

**症状 2：人工审核卡片点「通过」偶尔 422「该人工节点当前没有等待中的审核」，运行永久卡在 waiting_human。** 最初以为是提交接口 bug，最后定位是 Next dev 按需编译重置了模块级服务容器（SSE 持有旧 flowRunner，POST 命中新实例）。这个只在开发模式出现、且与编译时机相关的问题极有迷惑性——固化容器到 globalThis 后消失。教训是：**本地 dev 下的「偶现挂起失效」要先怀疑 HMR 单例，再怀疑业务代码**。

还有一个纯前端的小修：画布空白处点击关闭配置抽屉。React Flow 的 onPaneClick 在某些渲染层（Background SVG）上不稳定，兜底做法是在画布包装 div 的 onClick 上判断 `event.target.classList.contains('react-flow__pane')`。这种「官方回调 + 事件目标兜底」的组合在画布类应用里很常用。

---

## 面板与编辑器的布局耦合

试运行面板是编辑器布局里的条件区块，不抢路由（不另开 /runs 页面）：

```text
工具栏
├─ 节点面板 │ 画布（flex-1）│ 配置抽屉
└─ 试运行面板（runId 非空时出现，固定 h-80，画布区域相应收缩）
```

固定 320px 高度而非全屏抽屉，是为了让用户**边看时间线边看画布**——节点高亮和时间线同步滚动是这个调试器的核心价值，全屏面板会把画布挡住。时间线区域内部滚动，页面整体不产生外层滚动条。

---

## 小结

- 单一 hook（useFlowRunEvents）+ 纯状态归一函数，同一份状态驱动画布高亮与时间线；订阅严格绑 runId、全局唯一；
- 时间线保留原始节点事件序列（含 waiting/skipped 过程），输入输出按需展开，过程可审计；
- 人工审核与危险工具授权内联在时间线上方，提交后同一 SSE 自然续流，无需刷新重连；
- 取消无确认、重跑预填上次入参、入参表单直接读 start 节点声明，围绕「低成本反复试」设计；
- 两个 EventSource 真机坑（终态重连风暴、dev HMR 单例分裂）的现象与修复都已固化；
- 面板固定高度内嵌，保证「节点高亮 ↔ 时间线」的视线联动。

调试闭环完成后，下一篇讲这套引擎的收束动作：调好的流程怎样以一个普通工具的身份回到对话里——第三工具来源如何自动注入、节点事件怎样穿过既有的工具调用循环出现在聊天卡片上，且聊天主循环一行未改。
