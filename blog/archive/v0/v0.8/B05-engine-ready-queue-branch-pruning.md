# 分支不靠模型：就绪队列、条件剪枝与 skipped 补发的确定性引擎

让 AI 临场决定每一步，流程就不可复现；把分支判断交给规则，执行轨迹才能逐字节确定。这篇讲我们桌面 AI 工作流引擎的运行时内核：一个纯顺序的 AsyncGenerator，一套「活性判断」算法，以及为什么被条件剪掉的节点也必须收到一条显式的 skipped 事件。

## 引擎的核心承诺：相同输入，相同路径

这套引擎的立身之本是一句话：**相同输入多次运行，执行路径一致**。这句话直接决定了引擎里最重要的一个设计决定——条件判断不允许使用模型。

社区可视化流程工具的常见做法是让 LLM 节点输出一个 JSON（`{"decision": "branch_a"}`），引擎读这个字段决定走哪条边。看起来优雅，实际把整个流程的确定性抵押给了三件不可控的事：模型本次有没有严格按 schema 输出、温度波动下判断会不会翻转、提示词里没覆盖的输入会走向哪里。调试时你甚至无法复现「它上次为什么走了这条边」。

condition 节点因此被设计成**声明式规则求值器**：

```ts
type ConditionOp = '==' | '!=' | 'contains' | 'notContains'
                 | 'startsWith' | 'endsWith' | '>' | '<' | 'isEmpty';
// rules + match('all' | 'any') → boolean
```

左值/右值都是引用解析后的纯值（引用插值在执行前已完成），求值是一个纯函数，同输入同输出，零网络、零温度、零悬念。需要「语义判断」怎么办？前面放一个 llm 节点把模糊输入写成结构化结论，再用规则节点对结论做确定性比对——把不确定性关在节点内部，让节点之间的路径永远确定。

---

## 执行骨架：一个 AsyncGenerator，事件即状态

引擎签名是一个异步生成器：

```ts
async function* runFlow(compiled, options): AsyncGenerator<FlowEventPayload> {
  yield { type: 'run_started', ...base, version, trigger };
  for (const nodeId of compiled.order) {
    // 活性判断 → 执行/跳过 → 落事件
  }
  yield { type: 'run_succeeded', output, ... };
}
```

产出的 9 种事件既是 SSE 推给前端的实时画面，也是落库的数据源（run-store 消费同一流），还是对话调用时映射工具子步骤的原料。**事件流是引擎唯一的输出通道**——没有第二条「返回最终结果」的路径，终态本身也是一个事件。这让试运行、对话调用、未来的 API 触发器只是三种不同的事件消费者，引擎不需要知道谁在消费。

按拓扑序线性遍历看起来比「动态就绪队列」简单，但这里有个必须处理的问题：拓扑序里包含**本次运行不该执行的节点**（被条件剪掉的分支）。线性遍历 + 活性判断就是这个简化模型的完整形态。

---

## 活性判断：这个节点本次该不该跑

每到一个节点，先问它「活不活」：

```ts
function isNodeLive(nodeId, startNodeId, incoming, state, liveEdges, compiled) {
  if (nodeId === startNodeId) return true;          // start 恒活
  return (incoming.get(nodeId) ?? []).some((edge) => {
    if (state.get(edge.source) !== 'succeeded') return false;  // 前驱必须成功
    const sourceNode = compiled.nodesById.get(edge.source);
    // 前驱是 condition 时，只有命中的那条分支边导通
    return sourceNode?.type !== 'condition' || liveEdges.has(edge.edgeId);
  });
}
```

三个条件合起来才「活」：

1. **至少一条入边存在**（编译器已保证非 start 节点有入边，这是双保险）；
2. **那条入边的前驱 succeeded**——前驱失败整个 run 已经终止，前驱被跳过则它的后继默认不活；
3. 如果前驱是 condition，**这条边必须在 liveEdges 集合里**——condition 求值为 true 时只有带 `sourceHandle: 'true'` 的边被加入 liveEdges，false 同理。

不活的节点不执行，但不能无声无息——前端时间线要显示它为什么没跑、节点在画布上要变灰。引擎补发一条 skipped 事件：

```ts
yield { type: 'node_skipped', nodeId: restId, reason: '所在分支未被条件命中' };
state.set(nodeId, 'skipped');
```

这条补发是分支剪枝正确性的一半：**跳过是一种显式的执行结果，不是缺席**。试运行结束后每个节点都有确定状态（succeeded / skipped / failed），时间线上不会留下「这个节点怎么什么都没发生」的空洞。

---

## condition 求值与 liveEdges：一次性算清，只导通一条

condition 处理器（refs 解析后）返回 `{ result: boolean }`，引擎拿到结果后立刻把导通边集合算出来：

```text
condition result = true
  liveEdges ← 从该节点出发、sourceHandle === 'true' 的边
condition result = false
  liveEdges ← sourceHandle === 'false' 的边
```

注意：普通节点的出边永远导通（不需要进 liveEdges 判断，活性函数里对「前驱不是 condition」直接放行）；只有 condition 的两条边参与导通选择。这个区分让「普通直连」零额外开销，分支语义只加在需要的地方。

因为编译器已经强制 condition 的 true/false 两个句柄都连了边，求值结果无论真假都一定有一条导通路径可走——「走到条件节点后无路可走」在结构层已被消灭。

---

## 失败即终止：不做错误分支自动绕行

节点处理器抛错时的行为是刻意的简单：

```ts
catch (err) {
  state.set(nodeId, 'failed');
  yield { type: 'node_failed', nodeId, message };
  yield { type: 'run_failed', nodeId, message };
  return;
}
```

没有「失败后自动走另一条边」「失败重试 N 次」这类内建语义。原因：错误语义高度业务化——检索失败可能该重试，LLM 失败可能该降级模型，人工被拒可能是**正常的业务分流**（它不是异常，输出 `approved:false` 后流程照常往下走 condition 判断）。把这些塞进引擎只会得到一套谁都不满意的策略。

分流方式是「**用数据表达分支，而不是用异常**」：

- 工具执行失败（ok:false）不抛错，返回 `{ ok: false, output, summary }`，后面接一个 condition 判断 `tool.outputs.ok == false` 走补偿路径；
- 人工驳回是正常输出，不是失败；
- 真正的异常（配置错误、模型 401、节点代码 bug）才让 run failed 整单停止，并把错误钉在具体节点上。

---

## 取消：AbortSignal 贯穿到模型和工具

取消不是标志位轮询，而是 `AbortSignal` 一路传到最底层的网络调用：

```text
SSE 连接关闭 / POST /control cancel
  → AbortController.abort()
  → signal 透传给 provider.chatStream（HTTP 请求中断）
  → 透传给 executeToolCall（与 15s 超时信号 AbortSignal.any 合并）
  → 引擎捕获 abort，产出 run_cancelled 而非 run_failed
```

细节在于区分「取消」和「失败」：await 抛错后要先判断 `signal.aborted`，是取消就发 `run_cancelled`，否则才是 `node_failed`。工具层把用户中断、超时、真实异常做成三种不同的结果摘要（工具执行层已有资产），引擎只负责顶层状态归类。

---

## 人工与工具挂起：yield 点上的状态机

引擎里最特殊的两类节点是 human 和 tool（write/danger 权限），它们会**挂起**。挂起的实现是一个「Promise + 事件」的时序协议（SSE 一篇细讲），引擎代码里的关键是顺序：

```ts
// 必须先拿到 pending Promise（注册挂起项），再 yield waiting 事件
const pending = ctx.requestHuman(nodeId, config);
yield { type: 'node_waiting_human', nodeId };
const decision = await pending;   // 在这里暂停，直到外部提交或断线
```

Promise 创建必须在事件发出**之前**完成同步注册——如果先 yield 事件、消费者立刻调提交接口，此时挂起项还没注册好，提交就会落空（404/422）。这个时序在工具门控里复刻了一遍。非交互触发（对话调用）下 `pending` 直接为 null，await 得到「拒绝」，流程不挂起继续走——同一套引擎代码服务两种触发模式。

---

## 为什么没有「动态就绪队列」也敢叫就绪队列

严格说当前的遍历是「拓扑序 + 活性过滤」，而不是运行时动态计算零依赖节点的经典就绪队列。这么选的理由值得记下：

- 拓扑序在编译期算好，运行时零调度开销、执行顺序逐字节可预测（相同图相同输入 → 事件序列完全一致，测试快照稳定）；
- 动态队列的价值（同层并行、运行时发现可执行节点）属于并发引擎，当前明确串行，用不上；
- 活性判断（前驱成功 + 边导通）本质上是在静态序上动态决定「跳过哪些」，复杂度和动态队列相当，但实现和心智都简单得多。

后续若做同层并发，拓扑序提供的「层级」信息仍然直接可用——同一 Kahn 层内的节点天然可并行。现在的设计没有给未来挖坑。

---

## 小结

- 分支用声明式规则而非模型，是「相同输入相同路径」承诺的根基；语义判断前置成 llm 节点，不确定性不外溢；
- 引擎是纯 AsyncGenerator，9 种事件同时服务 SSE/落库/对话子步骤；
- 活性 = 存在前驱成功 + condition 分支边导通；跳过必须补发显式 skipped 事件；
- 失败与业务分流分离：工具 ok:false / 人工驳回是数据，可接 condition；真异常才终止 run；
- 取消用 AbortSignal 贯穿到底层网络；挂起节点遵循「先注册 Promise 再发事件」的致命时序；
- 静态拓扑序 + 动态活性过滤，是串行确定性阶段性价比最高的调度形态，也为后续同层并发留了层级信息。

下一篇讲这套引擎怎么通过 HTTP 暴露给浏览器：为什么 POST 只登记不执行、SSE 连接为什么就是运行本身、终态运行为什么还能「重放」给后来打开面板的人。
