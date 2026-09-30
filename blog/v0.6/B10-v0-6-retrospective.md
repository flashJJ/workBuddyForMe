---
title: "v0.6 复盘：自实现的账、E2E 的缓存灵异事件、以及给 v0.7 铺的路"
series: "WorkBuddy For Me v0.6 技术拆解"
number: "B10"
tags: ["workbuddy", "retrospective", "mcp", "testing", "methodology"]
date: "2025-Q4"
---

## 复盘一：SDK vs 自实现的账，结论前置

v0.6 最重要的决策是 B02 的 MCP 客户端自实现。完整算一次账：

**官方 SDK 方案的成本**：17 个传递依赖（express5/hono/jose 等服务端包）+ lockfile +513 行 + Electron 打包归集面扩大 + 每个依赖未来的 CVE 响应义务。

**自实现方案的成本**：5 个文件（jsonrpc/stdio-transport/http-transport/client/registry）+ 17 个测试 + 协议演进时需要自己跟进（protocolVersion 协商留了空间）。

结论成立的前提是**协议面窄**：我们只要 initialize + tools/list + tools/call 四个方法。如果未来需要 resources/prompts/sampling，账要重算——但那时需求是实的，现在自实现的每一行都还在用。

这条决策方法论可以泛化：**「官方库」的权威性不等于「适合你的用法」**。SDK 为全功能客户端+服务端设计，我们是窄面纯客户端——为别人的通用性付打包税之前，先算清楚自己用到协议的几分之几。

---

## 复盘二：E2E 的 webpack 缓存灵异事件

M2 门禁跑批时 E2E 离奇失败：7 个用例全挂，错误是 webpack 模块解析损坏（`Cannot find module './vendor-chunks/...'`），但**代码没动过**。

根因是两层叠加：3000 端口上有一个遗留的 dev server（v0.5 B10 的幽灵进程同款），E2E 脚本启动自己的服务器时端口冲突；更糟的是两个服务器共享同一个 `.next` 缓存目录——**两个 Next 进程并发写 webpack 缓存，缓存文件写坏**。

修复：杀掉遗留进程 + 清 `.next` 缓存后恢复。但教训不止「记得杀进程」：

**共享可变状态是测试的大敌，包括文件系统状态**。进程隔离做了（不同端口），但构建缓存目录是隐式共享的。E2E 脚本后来加了防御：启动前检测端口占用 + 使用独立构建目录。**环境的隐式共享状态和代码的显式 bug 一样需要测试化管理**。

---

## 复盘三：300 行门禁逼出来的好拆分

M3 收尾时 mappers.ts 超了 300 行门禁，拆出 mcp-mapper.ts。这类「被门禁逼出来的拆分」在 v0.6 发生了几次（restore.test 也压缩过）。

单文件 ≤300 行这个规则的价值不在数字本身，在于它强制回答一个问题：**这个文件里是不是有兩個职责？** mappers.ts 里 DB 行 → 领域对象的映射，MCP server 的映射和其他的混在一起——超行数是「职责过密」的传感器。门禁的用途是让「代码味道的直觉」变成「CI 里的红灯」。

---

## v0.6 给 v0.7 铺的路

v0.7「桌面 Agent」（看得见、动得了手）在 v0.6 的骨架上直接生长：

| v0.6 铺的 | v0.7 长的 |
|---|---|
| 权限三级 + HITL 挂起恢复 | 键鼠工具 danger 级，复用整套确认链路 + 扩展 remember='task' 任务级授权 |
| 熔断器 | 任务循环的自动终止信号（同工具 3 连败 → 任务终止） |
| 控制通道（desktop 主进程 ↔ web server） | 屏幕截图/键鼠执行走同一通道（`WBFM_COMPUTER_CHANNEL` + token） |
| 工具限定名与统一注册表 | 屏幕/键鼠工具注册进同一表，模型无感知 |
| 调试台 | 桌面工具的排障入口（UIA 控件树单测） |

回头看，v0.6 的「权限 + 确认 + 熔断」三件套是为「工具会越来越多、越来越危险」准备的——而 v0.7 的键鼠执行正是「最危险的工具」。**每个版本的收尾件，往往是下个版本的地基**。

---

## 全系列索引

- [B01 总览：会接活——MCP 生态、技能包、权限分级与 HITL](file:///e:/code/traeWork/workBuddyForMe/blog/v0.6/B01-v0-6-overview-pluggable.md)
- [B02 MCP 客户端最小自实现：为什么弃官方 SDK，五个文件撑起完整协议](file:///e:/code/traeWork/workBuddyForMe/blog/v0.6/B02-mcp-minimal-client-no-sdk.md)
- [B03 stdio 子进程生命周期：树杀为什么是 taskkill /T /F，监听器泄漏怎么防](file:///e:/code/traeWork/workBuddyForMe/blog/v0.6/B03-stdio-process-lifecycle.md)
- [B04 三级权限模型：read 放行、write 问一次、danger 必须点头](file:///e:/code/traeWork/workBuddyForMe/blog/v0.6/B04-three-tier-permission-model.md)
- [B05 HITL 挂起-恢复：在 SSE 流中间等用户点按钮](file:///e:/code/traeWork/workBuddyForMe/blog/v0.6/B05-hitl-suspend-resume.md)
- [B06 技能包体系：skill.json 声明式定义、文件夹即插即用、删除只删引用](file:///e:/code/traeWork/workBuddyForMe/blog/v0.6/B06-skill-packages-manifest.md)
- [B07 工具熔断器：连续失败 3 次跳闸，5 分钟半开试探](file:///e:/code/traeWork/workBuddyForMe/blog/v0.6/B07-tool-circuit-breaker.md)
- [B08 HTML 正文抽取：剥掉导航噪声后的 token 效率革命](file:///e:/code/traeWork/workBuddyForMe/blog/v0.6/B08-html-content-extraction.md)
- [B09 工具调试台：不经模型、不经熔断、不经弹窗的「试一试」](file:///e:/code/traeWork/workBuddyForMe/blog/v0.6/B09-tool-debug-console.md)
- B10 本篇：v0.6 复盘

---

## 一句话总结

v0.6 把工具从「出厂自带」变成「用户可扩展的生态」，并用权限、确认、熔断证明了一件事：**开放性（接生态）与可控性（不失控）不是 trade-off，而是同一个设计的两面**——只要安全机制跟得上开放速度。v0.7 将在这个骨架上长出桌面 Agent 的手和眼，那是本系列下一个故事。
