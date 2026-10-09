# 调好的流程怎样零侵入变成对话里的工具：第三来源与节点级子步骤透传

流程图的产品闭环终点不在编辑器页面，而在普通聊天框：用户说一句「按我的周报流程整理一下这周工作」，模型自主发起调用，工具卡片逐节点点亮，最后基于流程产出给出回答。这篇讲在我们这个本地优先的桌面 AI 应用里，已发布流程如何作为工具运行时的第三个来源自然接入——不改助手配置表、不改聊天主循环——以及节点级进度怎样穿过工具调用循环到达前端卡片。

## 终极目标不是画布，是对话里的一句话

```text
用户：「按我的周报流程整理一下这周工作」
模型：（自主发起 tool_call：flow:<流程 id>）
对话工具卡片：开始 ✓ → 生成周报草稿 ✓ → 人工确认 ✓ → 输出周报 ✓
模型：基于流程产出，给出最终回答
```

这件事的约束很苛刻：**不改动助手配置表、不改动聊天主循环**。流程必须像 MCP 工具一样，作为工具运行时的一个新「来源」自然长出来。

---

## 工具解析的第三来源：builtin → mcp → flow

工具运行时的解析函数原本已有两个来源：

```ts
function resolveTool(name) {
  const builtin = ALL_TOOLS[name];
  if (builtin) return { tool: builtin, source: 'builtin' };
  // mcp:<server>:<tool>
  const info = mcpRegistry.getTools().find(t => t.qualifiedName === name);
  if (info) return { tool: createMcpTool(info), source: `mcp:${info.serverName}` };
  return null;
}
```

在中间插一层 flow 判断，命名沿用 mcp 的限定名风格：

```ts
const flowRef = parseFlowToolName(name);  // 'flow:<uuid>' → { workflowId }
if (flowRef) {
  const flowTool = deps.flowToolResolver?.(flowRef.workflowId) ?? null;
  if (flowTool) return { tool: flowTool, source: 'flow' };
  return null;
}
```

注意 `flowToolResolver` 是**懒注入的回调**而不是在 ToolRuntime 构造时直接传入 FlowRunService。这是为打破构造环：容器里 flowRunner 内部持有 runtime（工具节点要调 runtime 执行工具），而 runtime 又需要能解析 flow 工具（流程图里可以嵌套调用别的流程）。直接互相 import/传参会在构造时打结；用一个 deps 上的可选回调，runtime 构造时不需要认识 flowRunner，容器装配完 flowRunner 后再回填 `deps.flowToolResolver`，环就断成了一条直线。

解析器（引擎阶段已就位）返回的 Tool 由 `buildFlowTool` 构建：名字 `flow:<id>`、描述取流程描述、parameters 由 start 入参 schema 生成、permission 固定 read。run 方法委托给 FlowRunService 的对话执行器。

---

## 最难的需求：发布流程自动出现在工具目录，且不改白名单表

工具表装配函数（决定某助手这一轮能看到哪些工具）原本只解析助手白名单：

```ts
buildTools(assistant, supportsTools) {
  const map = new Map();
  for (const name of assistant.enabledTools) {
    const resolved = resolveTool(name);
    if (resolved) map.set(name, resolved.tool);
  }
  return map;
}
```

如果要求用户在助手设置里手动勾选 `flow:<uuid>` 才能在对话里用，体验是断裂的（发个流程还得去配置助手），而且 uuid 工具名出现在勾选列表里也很怪。实际做法是在白名单解析后**自动追加全部已发布流程**：

```ts
// 已发布流程自动注入（白名单不感知 flow:<id>，不覆盖显式项）
for (const tool of deps.flowToolLister?.() ?? []) {
  if (!map.has(tool.name)) map.set(tool.name, tool);
}
```

`flowToolLister` 同样是容器回填的懒回调，内部就是「列出 status=published 的工作流 → 逐个 resolveAsTool」。于是发布操作的语义变成：**点发布 = 让这个流程在下一轮对话里对所有助手可见**；取消发布 = 工具从目录消失。助手白名单表零行改动，旧助手自动获得调用全部已发布流程的能力。

「不覆盖显式项」的防御让未来可以在助手级屏蔽特定流程时保留扩展位。

---

## 对话触发的执行路径：非交互、不挂起、产出最终文本

对话里执行流程不能走试运行那套（SSE 挂起等人工点按钮会把一次普通 tool_call 永久挂住）。run-service 提供独立的 `invokeFromChat`：

```ts
const trigger = 'chat';                       // 非交互
const events = executeRun(runId, { ..., interactive: false });
for await (const event of events) { /* 收敛 */ }
```

交互性差异全部在引擎既有的两个挂起点生效：

- **human 节点**：interactive=false 时不 await，直接得到 `{ approved: false }`。注意这不是异常——流程可以正常继续（内置周报流水线里有 human 节点，对话调用时它自动「放行式继续」，真机实测该节点显示为成功、输出 approved=false）；
- **write/danger 工具节点**：对话触发没有 requestToolConfirmation 回调，直接按拒绝处理，工具返回 ok:false。这条规则为后续的无人值守触发器（HTTP/定时）预埋了「默认拒绝 danger + 发布时显式授权」策略位。

flow 工具的 run 最终把流程输出归一成 ToolResult——字符串原样返回，对象 JSON 化：

```ts
const text = typeof result.output === 'string' ? result.output : JSON.stringify(result.output);
return { ok: true, output: text, summary: `工作流「${name}」执行完成`, substeps };
```

这个文本会作为 tool 角色消息回灌给模型，模型再据此组织最终回答。**流程不直接对用户说话，它只是模型调用的一个工具**——闭环仍由聊天主循环掌控。

---

## 子步骤透传：最难的技术点

验收标准要求：对话工具卡片里能看到流程内部的节点级进度（开始/大模型/人工/结束）。但工具的 `run(args, ctx)` 是一个 Promise，内部引擎却是一个逐节点 yield 事件的 AsyncGenerator——**回调风格的内部产生者，generator 风格的外部消费者，怎么桥接？**

### 第一步：ToolContext 加一个进度回调

```ts
interface ToolContext {
  // ...既有字段
  onSubstep?: (substep: ToolSubstep) => void;
}
```

flow 工具 run 时把 ctx.onSubstep 传给 invokeFromChat；后者内部用一个子步骤收集器消费引擎事件：节点事件映射为 ToolSubstep（开始→running、成功→ok 带输出摘要、跳过→skipped、失败→error 带错误信息，标题取节点 config.label 或中文类型名），每收到新状态就调用 onSubstep。

### 第二步：工具循环里用异步队列桥接

对话的工具调用循环（tool-call-loop）本身是 async generator，要在 `await tool.run()` 的同时不断 yield 子步骤事件。做法是一个「无限容量 + close 约定」的队列：

```ts
const queue = createSubstepQueue<ToolSubstep[]>();
const execution = traceAsync(..., () => executeCall(tool, call, {
  ...toolCtx,
  onSubstep: (s) => { collector 更新; queue.push(回调时刻快照); },
})).finally(() => queue.close());

for (;;) {
  const item = await queue.next();
  if (item.done) break;
  yield { event: 'tool', data: { phase: 'substep', callId, substeps: item.value } };
}
result = await execution;
```

执行 promise 和事件消费在同一个 async 函数里交替推进：run 内部回调一 push，队列的 next() 就 resolve，生成器 yield 一条 `tool/substep` SSE；run 结束 finally close 队列，消费循环退出，再拿到终态 result 正常走原有的 tool/end 流程。

这里有个真机测试抓出来的细节：**入队必须是快照（`[...substeps]`）而非数组引用**。flow 工具可能在一个同步执行段里连发多个回调，等生成器第一次被调度去 yield 时数组已推进到最终态，前端会看到「1,1,2,2」变成「2,2,2,2」。push 时切片，时序才被正确定格。

### 第三步：事件协议只加一个 phase

shared 的 ToolEventPayload 从两阶段变三阶段：

```ts
| { phase: 'start'; ... }
| { phase: 'substep'; callId; substeps: ToolSubstep[] }   // 新增
| { phase: 'end'; ...; substeps? }                        // 末态快照
```

工具 trace 落库结构（messages.tool_trace）也加了可选 `substeps`：end 事件携带最终快照，工具循环 push trace 条目时带上——**历史消息刷新后不依赖 SSE 也能渲染完整节点时间线**。前端 live-message-utils 里三个纯函数（start 占位 / substep 合并 / end 合流并保留流式快照）保证流式过程和历史加载同构。

对话工具卡片（既有的 ToolTrace 组件）里多渲染一层子步骤列表：每个节点一行小图标（蓝旋转/绿勾/红叉/灰跳过）+ 节点名 + 摘要。flow 工具另有专属视觉：「工作流」图标名、绿色「流程」来源徽章。模型看到的工具名是 `flow:<uuid>`，用户看到的是「工作流」。

---

## 完整链路：一句话经过的所有层

```text
用户消息
 → 模型 function-calling 决策（tools 里自动包含已发布 flow 工具）
 → tool-call-loop：tool start（SSE）
 → resolveTool('flow:<id>') 命中第三来源
 → invokeFromChat（trigger=chat, interactive=false）
    → 引擎逐节点执行：node_started/succeeded…
    → 每节点经 collector → ctx.onSubstep
    → 异步队列 → tool substep（SSE，前端卡片逐行点亮）
 → 终态：ToolResult 文本回灌
 → tool end（SSE，substeps 快照落 tool_trace）
 → 模型读到工具结果，生成最终自然语言回答
```

真机验证的结果：模型第一轮就正确选中了周报流水线，参数里干净地只传了三条要点（没把指令文字混进 JSON），97.9 秒（两轮模型调用：决策轮 + 总结轮）后工具卡片滚出 4 个绿色节点，回答是完整四小节周报。

---

## 安全与语义边界

- flow 工具固定 permission=read，但它内部的工具节点仍**独立过自己的门控**——对话场景 danger 节点默认拒绝，试运行场景弹内联授权。外层工具的权限不放大内部节点权限，避免「套个流程壳绕过 HITL」；
- 每次对话执行也建 workflow_runs/node_executions 记录（trigger=chat, conversationId 关联），流程被调用了几次、每次每个节点的输入输出全部留痕，和试运行记录同一张表；
- 流程工具内部理论上可以再调用别的已发布流程（resolveTool 第三来源对流程执行同样生效），形成跨流程复用；环（A 调 B、B 调 A）没有在工具层静态拦截，靠 DAG 自身无环 + 运行时不做循环语义来约束，嵌套深度保护登记到后续版本。

---

## 为什么这套集成方式是对的

回头看，零侵入目标能达成，本质是因为早期积累的工具体系抽象得足够稳：Tool 接口（name/description/parameters/run）、ToolContext 注入、ToolResult 归一、SSE 两阶段事件、trace 落库、权限门控——flow 工具做的全部事情就是「实现同一个 Tool 接口 + 利用好同一个 Context」。它和 MCP 工具在工具循环眼里毫无区别，只是 source 字段不同。

新增的全部东西：一个来源分支、一个自动注入循环、一个 Context 回调、一个 SSE phase、一个队列、一个前端子列表。聊天主循环的控制流、消息表结构、HITL 弹窗协议、函数声明下发逻辑全部原样。**好的平台化设计的标志，就是新能力以插件形态接入时，宿主代码只需要加分支，不需要改骨架。**

---

## 小结

- 第三来源用懒注入回调打破 flowRunner ↔ runtime 构造环；已发布流程经 flowToolLister 自动追加进每个助手的工具表，白名单表零改动；
- chat 触发走独立非交互路径：人工节点自动继续、danger 工具默认拒绝，为无人值守触发预埋策略；
- 节点级进度靠 ToolContext.onSubstep 上抛，异步队列把 Promise 内部回调桥接成 generator 的 substep 事件；队列里传快照不传引用；
- 协议仅加一个 SSE phase + trace 可选字段，流式与历史渲染同构，聊天主循环零改动；
- 外层 read 权限不放大内层门控，运行全程落 runs/node_executions 留痕；
- 真机端到端验证：模型自主调用、参数干净、节点时间线实时可见、最终回答基于流程产出。

最后一篇做整套工作流引擎的复盘：确定性与自主性这笔账到底怎么算、单人项目的边界纪律、以及这套东西给后续服务化留了哪些口子。
