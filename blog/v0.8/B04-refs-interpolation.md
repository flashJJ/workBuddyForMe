---
title: "节点之间的数据怎么流动：{{$nodes.xxx}} 引用插值与 $ref 整字段绑定"
series: "WorkBuddy For Me v0.8 技术拆解"
number: "B04"
tags: ["workbuddy", "template", "interpolation", "json-ref", "type-system", "dag"]
date: "2026-10"
---

## 没有引用，流程图只是一堆孤岛

连线只表达了「先后」，没表达「数据」。知识检索节点搜到的 context，怎么变成大模型节点 user 提示词里的内容？人工节点的 approved 布尔，怎么成为 end 节点的最终输出？

v0.8 的答案是一套小而完整的引用协议，两种形态：

```text
① 字符串插值（模板）
   检索词：{{$nodes.start.params.topic}}
   User：  基于资料回答：{{$nodes.search.outputs.context}}

② 整字段绑定（$ref）
   end.config = { "output": { "$ref": "nodes.llm_1.outputs.text" } }
```

路径三段式固定：`nodes.<节点id>.<params|outputs>[.<字段路径>]`。start 节点取 `params`（运行入参），其余节点取 `outputs`（处理器返回值）。

---

## 为什么需要两种形态：字符串拼接 vs 类型保持

只有插值看起来也够用——`output: "{{$nodes.llm_1.outputs.text}}"` 不就拿到文本了吗？但问题在类型：

- 插值的结果**永远是字符串**。哪怕引用的是布尔 `true`，插完也变成 `"true"`；引用的是 chunks 数组，插完变成 `[object Object]`；
- 而工具节点的参数（如 `topK: 4`）、condition 左值做数值比较（`>`）、end 直接输出一个对象，都需要**原始类型**。

所以规则设计成：

- 值是字符串 → 递归扫描其中的插值 token 做文本替换；**整串恰好只有一个 token、前后无其他字符时，返回原始值本身**（布尔还是布尔，数字还是数字）；
- 值是对象且恰好形如 `{ "$ref": "路径" }` → 直接取出该路径上的值，对象/数组原样透传。

这个「整串单 token 保类型」的细节极其关键，它让「把上游布尔直接传到下游」不需要任何特殊节点：

```text
end.config.output = "{{$nodes.review.outputs.approved}}"
              → 实际输出 boolean true/false（不是字符串）
```

人工节点的通过/驳回结果之所以能直接成为流程输出（M2 真机验证的那条链路），靠的就是这条规则。

---

## 解析发生在什么时候：节点执行前，统一过一遍

不是每个 handler 自己去解析自己的配置——那样 7 个处理器各写一套、错误格式五花八门。引擎在每个节点执行**之前**做一次统一的 `resolveFlowRefs`：

```ts
// 引擎主循环（简化）
const resolvedConfig = resolveFlowRefs(node.config, scope);
// 然后才把 resolvedConfig 交给具体 handler
```

`scope` 是一张运行期作用域表：

```ts
type FlowScope = Map<string, Record<string, unknown>>;
// scope.get('search') → { outputs: { context: '...', chunks: [...] } }
// scope.get('start')  → { params: { topic: '周报' } }
```

节点成功后，引擎把它的返回值写进 scope；引用解析器只读已完成节点的作用域。这天然保证了两件事：

1. **能引用的一定已经执行完**——编译器的拓扑序保证前驱在前，引擎按序执行，所以解析到任何前驱引用时值必已就绪；
2. **不能引用自己或后继**——它们不在 scope 里（自己还没写、后继还没跑），直接抛 `RefResolutionError`。

把「引用合法性」前置到编译期是更激进的做法（编译器可以静态扫出「引用了不存在的节点」），但「节点尚未执行」这类**运行时态**问题只能运行时判定。两层分工：编译器管「路径上的节点和字段在图里存不存在」，解析器管「此刻这个值拿不拿得到」。

---

## 路径取值：支持深层路径与 $ref 嵌套

字段路径不止一级。工具节点返回 `{ outputs: { text, tokens: { total } } }`，引用 `outputs.tokens.total` 就要深入对象：

```ts
function deepGet(obj: Record<string, unknown>, keys: string[]): { ok: boolean; value?: unknown } {
  let cur: unknown = obj;
  for (const key of keys) {
    if (cur !== null && typeof cur === 'object' && key in (cur as object)) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return { ok: false };  // 路径断裂
    }
  }
  return { ok: true, value: cur };
}
```

路径任一层不存在 → 结构化错误：`工作流引用无法解析：nodes.xxx.outputs.tokens（节点「x」没有 outputs.tokens）`。错误信息直接把节点 id 和缺失路径念出来，作者在画布上能立刻对上号。

`$ref` 还可以出现在数组和深层对象里——解析器是**递归遍历整个 config**的：工具节点的 args 里可以一部分写字面量、一部分写引用：

```json
{
  "url": "{{$nodes.start.params.url}}",
  "options": { "timeout": 15, "ref": { "$ref": "nodes.cfg.outputs.value" } }
}
```

解析器只替换叶子值，对象结构原封不动，所以工具 handler 拿到的 args 结构和它直接从模型 function-calling 收到的完全一致。

---

## 插值的正则：贪婪与转义的取舍

token 正则长这样（简化）：

```ts
const TOKEN = /\{\{\$nodes\.([a-zA-Z0-9][\w-]*)\.((?:[a-zA-Z_][\w]*)(?:\.[a-zA-Z_][\w]*)*)\}\}/g;
```

刻意的取舍：

- **不支持表达式**。不能写 `{{ a + b }}`、`{{ x || '默认' }}`、过滤器管道 `{{ x | upper }}`。表达式意味着要嵌一个模板语言（作用域、运算符、隐式类型转换、安全沙箱），而这些需求在 v0.8 由专门的节点承担——计算用 condition/未来的表达式节点，默认值在 start 入参的 `default` 字段声明。协议保持「纯取值」，可读性和安全性都好；
- **不做转义语法**。`{{` 在普通文本里几乎不会自然出现；真要输出字面量花括号的场景（让模型输出模板代码）在本版本不支持，登记而不实现；
- 字符串里有多个 token 时各自替换；未命中的引用抛错而**不是替换成空串**——静默空串会让「引用 id 拼错」变成「模型收到一段空白提示词后胡言乱语」，排查成本极高。

---

## 前端「插入变量」：让作者不用记 id

让人手敲 `{{$nodes.search_abc123.outputs.context}}` 是反人类的（id 还是随机的）。编辑器配置抽屉里每个可插值的文本框下面都有一个「+ 插入变量」下拉：

```ts
function buildRefOptions(nodes, currentNodeId): RefOption[] {
  // start 节点 → 列出 params.<入参字段>
  // 其他节点  → 按节点元数据列出 outputs 的已知字段
  // 排除当前节点（不能引用自己）
}
```

可引用的字段来自节点元数据表（如 knowledgeSearch 的 `context`/`chunks`，llm 的 `text`/`tokens`，human 的 `approved`/`values`），每个字段带中文说明。选中后在 textarea 光标位置插入 token，而不是拼到末尾——用 `selectionStart/End` 做了切片插入并恢复光标。

这里的关键体验是「变量列表只给得出、有意义的东西」：不是把作用域里的所有 JSON 键倒出来，而是维护一张节点输出契约表。这张表和 handler 的实际输出、引用协议三者同构，作者看到的选项就是运行时拿得到的值。

---

## 失败模式一览

解析器把所有异常收敛到一个 `RefResolutionError`，引擎捕获后节点状态置 failed、run 终止、SSE 发出 `node_failed` + `run_failed`：

| 情况 | 行为 |
|---|---|
| 引用的节点 id 不存在 | 编译器先拦（字段存在性静态检查）；漏网则运行时错误 |
| 引用后继/自己 | 运行时「节点 x 不存在或尚未执行」 |
| 字段路径断裂 | 运行时「节点 x 没有 outputs.yyy」 |
| 插值引用了对象/数组 | 文本替换（JSON 化）；要原对象请用 $ref |
| $ref 路径值为 undefined | 按引用错误处理，不静默成 null |

统一失败、显式报错、立即停止——确定性流程的任何一环拿到意外的空值都应该是**响的**，而不是带着脏数据继续跑三个节点后产出一篇胡说八道的文章。

---

## 小结

- 两种引用形态各司其职：插值面向文本拼接，`$ref` 面向类型保持；「整串单 token 保原始类型」是布尔/数值流转的关键；
- 解析在节点执行前统一递归完成，handler 拿到的 config 永远是「已兑现」的纯值，不感知引用协议；
- scope 按拓扑序填充，引用有时序合法性；路径深层取值、结构化错误、显式失败优先于静默空值；
- 协议刻意只做取值不做表达式，把计算推给专门节点，保持沙箱和可读性；
- 前端用输出契约表生成「插入变量」选项，随机节点 id 对作者不可见。

数据能流之后，下一篇 B05 讲引擎的控制流：就绪队列怎么推进、condition 为什么是规则而不是模型、以及「未命中的分支」上那些节点为什么必须收到一条 skipped——这是确定性 DAG 里最微妙的一段逻辑。
