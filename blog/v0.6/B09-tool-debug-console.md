---
title: "工具调试台：不经模型、不经熔断、不经弹窗的「试一试」"
series: "WorkBuddy For Me v0.6 技术拆解"
number: "B09"
tags: ["workbuddy", "debugging", "tools", "developer-experience"]
date: "2025-Q4"
---

## 问题：工具坏了，排查要先开一轮对话

v0.6 之后工具来源多了，排障场景随之而来：MCP server 连上了但工具调用失败、参数 schema 看着对但模型总调错、熔断跳闸后想知道恢复没有。

这些问题的共同点是：**你想知道「这个工具本身行不行」，但唯一的调用路径是开一轮对话让模型去调**——回答里混着模型的理解、工具的输出、可能的权限弹窗，噪声淹没了信号。排障需要一条「绕过模型、直达工具」的通道。

P1-2 的工具调试台（设置页）就是这条通道：选工具 → 填参数 JSON → 看结构化结果，不经模型。这篇讲它的三个设计决策：绕过谁、超时怎么定、参数编辑器的形态。

---

## 决策一：绕过熔断与 HITL，依据是「主动操作即授权」

调试执行器 [debug-executor.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/tools/debug-executor.ts) 与正常工具循环的区别：

```text
正常循环：resolveTool → 权限门控 → HITL 弹窗 → 熔断检查 → 执行
调试台：  resolveTool → 执行（带超时）
```

绕过的依据在 B07 说过：**用户在调试台点「执行」这个动作本身就是授权**。HITL 防的是「模型擅自行动」，调试台根本没有模型；熔断器防的是「无意识重复撞墙」，调试台是人有意识的单次试探——「我就想知道它现在通不通」，熔断器挡在前面反而让这个问题无法回答。

**超时仍在**：MCP 工具 60s（外部进程，冷启动/首次 list 可能慢）、内置工具 15s。调试台不是法外之地——没有超时的「试一试」会把设置页卡死。两个超时值的差异反映工具形态：内置工具是进程内调用，15s 已算病态；MCP 要跨进程 IPC + 外部服务，60s 是宽容但有限的等待。

**权限语义可见**：调试台的工具选择器上，权限徽章（read/write/danger）照常显示——绕过的是弹窗流程，不是权限信息。用户点击前知道自己要执行的是哪个级别的操作。

---

## 决策二：工具清单聚合内置 + MCP，按 source 分组

`listDebugTools`（core 层）聚合两域工具：内置工具（TOOL_NAMES 查表）+ 已连接 MCP server 的工具（registry 里 ready 状态的连接逐个 list）。

[tool-debug-panel.tsx](file:///e:/code/traeWork/workBuddyForMe/apps/web/src/features/settings/tool-debug-panel.tsx) 的选择器按 source 分组：

```text
▾ 内置
    knowledge_search (read)
    fetch_webpage (danger)
▾ filesystem (MCP)
    mcp:filesystem:read_file (read)
    mcp:filesystem:write_file (write)
```

分组的必要性来自限定名（B02）：`mcp:filesystem:read_file` 这种名字在扁平列表里会按字母序和内置工具混排，分组视图让「这个工具从哪来」一目了然——source 信息本来就在限定名里，分组只是把它显式化。

**断开/失败的 server 不出现在清单里**（registry 只暴露 ready 连接的工具）。这个过滤是刻意的：调试台的职责是「试能用的工具」，连不上的 server 归 MCP 面板（B03 的状态可视）管。两个面板各管一段，不重叠。

---

## 决策三：参数编辑器是 JSON 文本域 + Schema 折叠

参数输入的形态评估过两种：

**表单生成器**（按 JSON Schema 生成表单控件）：体验好，但实现重——schema 的嵌套对象、oneOf、数组形态要逐一映射控件，而 MCP 工具的 schema 是外部给的，千奇百怪。

**JSON 文本域 + Schema 参考折叠**（采用）：参数就是一个 textarea 输 JSON，旁边一个可折叠面板显示该工具的 inputSchema 原文。简单、通用、对任意 schema 不崩。

目标用户决定了选择：调试台的用户是「在排查问题的人」——他们手里通常正有一份模型发的 tool_call JSON（从 LangSmith 或工具卡片里抄的），粘贴比填表单快。**调试工具的输入形态应该匹配排障现场的数据形态**，排障现场的数据是 JSON，不是表单。

结果展示对称：结构化 JSON 结果原文展示（成功）/ 错误码 + message（失败），外加耗时。耗时在排障里是一等指标——「慢」和「错」是两类故障，耗时把前者量化出来。

---

## 小结

调试台的三个决策——主动操作即授权（绕过自动防护）、按 source 分组（限定名显式化）、JSON 输入（匹配排障现场）——都围绕一个定位：**它是给人用的排障工具，不是给模型用的调用通道**。同一套工具执行内核，换一层壳，从「模型的手」变成「人的探针」。

下一篇 B10 收尾 v0.6：复盘——SDK vs 自实现的账怎么算、E2E 的 webpack 缓存灵异事件、以及这个版本给 v0.7 铺了哪些路。
