---
title: "流程图凭什么能跑：环检测、Kahn 拓扑与能点到节点的诊断系统"
series: "WorkBuddy For Me v0.8 技术拆解"
number: "B03"
tags: ["workbuddy", "dag", "topological-sort", "cycle-detection", "compiler", "diagnostics"]
date: "2026-10"
---

## 编译器要回答的三个问题

结构合法（zod parse 通过）只说明「这是一张语法正确的图」，离「能执行」还差很远。编译器（`core/flow/compiler.ts`）回答三个问题：

1. 这张图能确定一个**唯一的执行顺序**吗？（有环 → 不能）
2. 每个节点都会被执行到吗？（孤岛、没有入边、从 start 不可达 → 不会）
3. 执行会不会走到一半没路了？（到不了 end、condition 分支没连全 → 会）

任何一个答案不乐观，就返回 `{ ok: false, diagnostics }`，并且——这是和画布 UI 的契约——**每条诊断都尽量带 nodeId 或 edgeId**，让错误能在画布上被精确点亮，而不是弹一句「图有问题」。

---

## 第一步：邻接表一次建好，后续全是图论作业

编译器把 FlowGraph 先转成一组索引（`graph-utils.ts`）：

```ts
interface Adjacency {
  successors: Map<string, SuccessorRef[]>;  // node → 出边（带 handle）
  predecessors: Map<string, string[]>;      // node → 入边来源
  indegree: Map<string, number>;
}
```

后面所有检查都基于这三张表，绝不重复扫描 edges 数组。SuccessorRef 上挂着 `handle: 'true' | 'false' | undefined`——分支信息是图的一等公民，因为剪枝时要靠它判断某条边在本次运行中导不导通。

---

## 无环：DFS 找环，且要给出「环长什么样」

只报告「图中有环」对用户毫无帮助——画布上可能有 30 个节点。所以环检测做的是**带回边路径的 DFS**：维护「递归栈中」的节点链，遇到指向栈内祖先的边时，把栈中从祖先到当前节点的切片作为环路径返回：

```text
诊断：流程图不允许出现环：review → revise → review
```

诊断直接带路径首节点的 nodeId，画布定位过去，作者一眼就能看到是「人工驳回后回到重写」这个在 v0.8 不被允许的循环。

为什么无环是硬约束？因为 v0.8 的执行语义是「每个节点至多执行一次」。有环就必须回答：循环几次？谁来终止？累积状态怎么合并？那是另一套引擎（v0.9+ 再议）。DAG 的「无环」不是限制表达力，是把「确定性可终止」焊进了模型。

拓扑排序本身也做兜底：即使前面的 DFS 漏了什么，Kahn 排序处理不完所有节点就能二次发现环。

---

## 拓扑排序：Kahn 算法与「顺序执行」的取舍

```ts
export function topoSortKahn(graph, adj): string[] | null {
  const indegree = new Map(adj.indegree);
  const queue = graph.nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const succ of adj.successors.get(id) ?? []) {
      const d = (indegree.get(succ.node) ?? 0) - 1;
      indegree.set(succ.node, d);
      if (d === 0) queue.push(succ.node);
    }
  }
  return order.length === graph.nodes.length ? order : null;
}
```

需要说明一个刻意的简化：**v0.8 同层节点不并发，拓扑序只用来定「合法先后」，运行时严格按数组顺序串行执行。** Kahn 队列里同一时刻有多个零入度节点时，取谁先谁后不影响正确性（它们之间无依赖），但顺序必须确定——按数组顺序（也就是创建顺序）打破平局，保证相同输入逐字节复现相同执行轨迹。

并发执行（同层节点并行、超时竞速）明确登记 v0.9。一个人的项目里，串行带来的可调试性（事件顺序稳定、日志好读、挂起点唯一）远比省几秒执行时间值钱。

---

## 端点规则：唯一 start、至少一个 end、边不能接反

```text
流程图必须恰好有 1 个 start 节点（当前 2 个）
流程图至少需要 1 个 end 节点
start 节点不允许有入边
end 节点不允许有出边
```

这里藏着一个非显然的设计：**允许多个 end，不允许多个 start。** 一个流程「从哪里开始」必须唯一（入参集合也只有一份），但「在哪里结束」可以分叉——condition 的不同分支可以各走各的 end，产出不同的最终结果。v0.8 的 starter「资料研究助手」就是双 end：检索为空走一个 end 返回「没找到资料」，有料走生成→人工→另一个 end。

配合的一条 MVP 限制是**普通节点（除 start/end）单入边**：

```ts
if (node.type === 'end' || node.type === 'start') continue;
if (ins > 1) diagnostics.push(error('multiple-incoming', ...));
if (ins === 0) diagnostics.push(error('missing-incoming', ...));
```

为什么禁止普通节点多入边（多分支汇聚到一个中间节点）？因为「汇聚」需要定义语义：两个前驱都成功才执行（and-join）？任一成功就执行（or-join）？被跳过的前驱算不算？这些语义在引擎层会显著增加复杂度。把汇聚限定在 end（执行到任意 end 即结束，天然是 or-join 且不需要继续推进），就覆盖了 90% 的真实分流场景，且零歧义。需要「分支后合流再处理」？v0.8 的回答是把流程拆成两个流程，用 flow 工具节点串联。

---

## 可达性：正向能到、反向能回，两边都查

最容易被漏掉的检查是「死路」——节点有入边、局部看没毛病，但从起点走不到它，或者它走不到任何终点：

```ts
const forward = reachableFrom(startId, adj);      // DFS 正向
const backward = reverseReachableTo(endIds, adj); // 反向 DFS（把边翻转）
for (const node of graph.nodes) {
  if (!forward.has(node.id)) error('unreachable-node', `节点「x」无法从 start 到达`);
  if (!backward.has(node.id)) error('dead-node', `节点「x」没有通向 end 的路径`);
}
```

两个集合一次 DFS 各 O(V+E)，便宜，但拦住的错误极其高频——用户拖了个节点忘了连线、删边后留下半截链条。正向不可达和反向不可达是两种不同的病：前者是「插在图外的孤岛」，后者是「悬在终点前的断头路」，文案分开写，定位都带 nodeId。

---

## condition 分支：两个句柄都必须连出去

这是分支节点特有的检查，也是运行时安全的关键：

```ts
for (const condition of nodes.filter((n) => n.type === 'condition')) {
  const handles = new Set(successors.map((s) => s.handle).filter(Boolean));
  for (const branch of ['true', 'false']) {
    if (!handles.has(branch)) {
      error('missing-branch', `条件节点「x」的 ${branch} 分支未连线`);
    }
  }
}
```

配套的边级规则还有：非 condition 节点的边**禁止**带 sourceHandle；condition 的出边**必须**带。为什么「没连的分支」算错误而不是 warning？因为运行时如果规则求值到了一条没连线的分支，引擎没有安全的默认行为——静默结束？走另一边？两种都违背用户预期。保存前直接拦下，逼作者显式画出两条路（哪怕「否」分支直接连到一个 end），岔路行为永远是确定的。

---

## 诊断结构：UI 定位的契约

所有检查产出同一种结构：

```ts
interface FlowDiagnostic {
  severity: 'error' | 'warning';
  code: string;        // flow/missing-branch 这种稳定码
  message: string;     // 给人看的中文描述
  nodeId?: string;     // 能定位到节点就带
  edgeId?: string;     // 能定位到边就带
}
```

前端拿到诊断数组后做三件事，全部不需要理解 code：

1. 节点/边 id 集合分别建成 Set，通过 React Context 下发给自定义节点和分支边，命中就画红虚线描边；
2. 底部诊断列表面板列出 message，error 红、warning 橙；
3. 点任意带 nodeId 的条目，`setCenter(node.x, node.y, { zoom: 1.1 })` 画布平滑居中并选中该节点。

「编译器输出机器可用的定位信息」这个约定，让校验从「弹个 alert」升级成「错误在图上发光、点一下飞过去」。而 warning 级别（当前主要预留给「condition 某分支虽连了但下游很简单」这类建议）不阻断保存，给未来留了弹性。

---

## 测试：编译器是全项目单测密度最高的模块

编译器纯函数、无 IO、输入输出明确，是最适合表驱动测试的地方。14 个测试用例基本是一张错误图配一条期望诊断：双 start、自环、重复边、非法句柄、环路径、孤岛、断头路、缺分支、合法菱形……这种测试写起来枯燥但收益极高——后面引擎和 UI 的所有正确性都建立在「进来的图一定可执行」之上，编译器多拦住一种坏图，引擎就少一个防御分支。

一个值得记住的工程判断：**把校验严格度放在编译器而不是运行时**。运行时发现「你有两个 start」已经晚了（run 都建了、SSE 都开了）；编译器在保存/试运行前就拒绝，错误反馈路径最短，作者心智里「能保存的图就是结构合法的图」。

---

## 小结

- 邻接表 + 入度表是所有检查的公共底座，一次构建全程复用；
- 环用带回边路径的 DFS，拓扑用 Kahn（平局按创建顺序，保确定性）；
- 唯一 start / 多 end / 普通节点单入边，是为「无歧义执行」刻意收窄的语法；
- 双向可达性检查拦住孤岛与断头路；condition 双分支必须显式连全；
- 诊断带稳定 code 与 nodeId/edgeId，让「校验」成为画布上的导航而非弹窗。

下一篇 B04 讲图跑起来之后的数据通路：节点 A 的输出怎么变成节点 B 的输入——`{{$nodes.xxx.outputs.yyy}}` 模板插值与 `$ref` 整字段绑定，以及为什么引用解析必须在节点执行前全部完成。
