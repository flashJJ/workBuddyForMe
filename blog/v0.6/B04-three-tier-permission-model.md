---
title: "三级权限模型：read 放行、write 问一次、danger 必须点头"
series: "WorkBuddy For Me v0.6 技术拆解"
number: "B04"
tags: ["workbuddy", "permissions", "security", "tools", "hitl"]
date: "2025-Q4"
---

## 问题：工具从 3 个变成 30 个以后

v0.2 时代工具是三个内置：`knowledge_search`、`fetch_webpage`、`current_time`。安全模型可以朴素——三个工具逐个审过就行。

v0.6 之后工具来源变成三处：内置、MCP（任意第三方 server）、技能包预绑定。工具数量从 3 到 30 只是时间问题，而且**新工具的能力边界不可预知**——filesystem server 能写文件，fetch server 能发请求，用户自己接的 server 什么都能干。

朴素安全模型破产的标志是：你无法再逐个审查工具，只能按**行为类别**管理。这就是权限分级的出发点：不问「这个工具是谁」，问「这个工具会做什么」。

---

## 三级划分：按副作用分级，不按来源分级

[types.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/tools/types.ts) 里工具声明带 `permission` 字段，三级：

| 级别 | 语义 | 默认策略 | 例子 |
|---|---|---|---|
| `read` | 只读观察，不改变任何状态 | 放行 | knowledge_search、window_list |
| `write` | 本地状态变更，可逆 | HITL 确认 | filesystem write_file、创建文档 |
| `danger` | 联网外发或不可逆操作 | HITL 确认（更醒目） | fetch_webpage、删除、键鼠（v0.7） |

三条设计原则：

**按副作用不按来源**。MCP 工具不天然危险，内置工具不天然安全——fetch_webpage 是内置的但它是 danger（把 URL 发给远端等于数据出机），filesystem 的 read_file 是 MCP 的但它是 read。来源决定信任度，副作用决定权限级，两者不混。

**read 必须默认放行**。如果读操作也要确认，用户每轮对话点五次弹窗，三天后所有人都会无脑点「允许」——**确认弹窗的有效性与其稀缺性成正比**。权限系统最大的敌人是确认疲劳，read 放行是保护 write/danger 弹窗权威性的前提。

**三级是刻意的少**。评估过更细的粒度（network 单列一级、exec 单列一级），结论是类别越多，工具作者的标注负担越重、标注质量越差。三级是每个工具作者（包括 MCP server 接入时的标注者）都能不假思索做对的粒度。**安全模型的可用性取决于它对人的要求**。

---

## 权限标注怎么进工具定义

内置工具在定义处声明（写死）；MCP 工具在 server 配置时按工具逐个标注（UI 上 server 表单里每个工具一个下拉，默认按工具名启发式预填——含 write/delete/send 的默认 write，用户可改）。

技能包在 manifest 里声明 `permissions` 摘要（它预绑定的工具集的最高级别），面板展示「此技能需要 write 级权限」。

三处的共同点：**权限声明是工具元数据的一等字段**，不是事后补丁。工具卡片上的徽章（read 无色 / write 黄 / danger 红）直接读这个字段。

---

## 持久化：`tool_permissions` 表与 remember 语义

HITL 弹窗的三按钮（拒绝 / 本次允许 / 一直允许）里，「一直允许」需要持久化——v008 迁移的 `tool_permissions` 表：

```text
qualified_tool_name  工具限定名（含 mcp: 前缀）
permission           当时的权限级
remember             授权范围：'once' | 'assistant'（会话级）| 'global'
granted_at           授权时间
```

查询语义：执行前查「该工具是否有有效授权」。`remember='assistant'` 是按助手维度的白名单——不同助手对同一工具的授权独立（「文件整理助手」一直允许 write_file，不代表「闲聊助手」也有）。

**撤销路径**：设置页 [permission-panel.tsx](file:///e:/code/traeWork/workBuddyForMe/apps/web/src/features/settings/permission-panel.tsx) 列出全部授权记录，单条撤销（DELETE /api/tools/permissions）。授权必须可撤销，否则「一直允许」就是一次性赌博。

**工具升级权限级怎么办**：工具定义更新导致权限级提升（read → write）时，旧授权失效（授权记录与当前级别比对）。授权是针对「当时那个副作用级别」的承诺，工具变了承诺就重谈。

---

## 权限门控的位置：循环里，不是路由里

权限检查在 tool-call-loop 的执行路径上（[tool-permission-gate.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/chat/tool-permission-gate.ts)，从 orchestrator 抽离的独立模块），具体顺序：

```text
模型发起 tool_call
  → resolveTool（解析限定名，内置查表 / MCP 转发）
  → 权限门控：read 直接放行；write/danger 查授权记录
      ├─ 有有效授权 → 放行
      └─ 无 → 挂起，发 SSE 确认事件（B05）
  → 熔断检查（B07）
  → 执行
```

为什么门控在循环里而不是 API 路由里？因为工具调用的发起者是模型，不是用户——HTTP 路由层的鉴权（那是防人的）与工具调用的授权（这是防模型的）是两个正交的安全面。模型在循环里可能一轮发 4 个 tool_call，每个都要独立过门控。

这个位置的另一个好处在 B09 会看到：调试台是「用户主动操作即授权」，它在循环外直接调 debug-executor，天然不经过这道门——**安全边界的位置决定了谁能合法地绕过它**。

---

## 拒绝不是报错：结构化「用户拒绝」回传

用户点「拒绝」后，模型收到的是一个结构化工具结果：

```json
{ "error": "USER_DENIED", "message": "用户拒绝了此操作" }
```

关键设计：**拒绝是工具结果，不是异常**。如果拒绝以异常形式中断循环，模型会把「用户不让做」理解为「系统故障」，开始重试或报错——两种都是坏行为。作为正常工具结果回传，模型能得体地继续：「好的，我不执行这个操作。需要我换个方式吗？」

这要求工具结果通道能表达错误语义（v0.2 的 tool result 结构本来就有 error 字段，直接复用），循环本身零改动。

---

## 小结

三级权限的本质是**用副作用分类替代工具审查**，让安全模型可扩展到任意多的工具来源。read 放行保护弹窗的稀缺性、remember 机制消除重复确认、拒绝走正常工具结果保护对话连续性——三条都指向同一个目标：安全机制要能在真实使用中活下来，而不是在纸面上完美。

下一篇 B05 讲这个模型里最工程化的部分：HITL 的挂起-恢复机制——同步的「等用户点按钮」怎么塞进异步的 SSE 工具循环里，120 秒超时和中断怎么处理。
