---
title: "浏览器自动化评估：为什么 v0.7 没有接入 playwright-mcp，以及打包体积与 ROI 的权衡"
series: "WorkBuddy For Me v0.7 技术拆解"
number: "B08"
tags: ["workbuddy", "desktop-agent", "playwright-mcp", "evaluation", "browser-automation", "trade-off"]
date: "2026-09"
---

## 评估背景

v0.7 方案 P1-1 原计划：以 MCP 服务器形式接入 `playwright-mcp`（微软官方），工具走 mcp 命名空间，支持连接用户日常 Chrome（CDP 端口）复用登录态，与任务模式联动。

用户故事：「去某网站搜 XX，把前三条结果存进知识库」——需要驱动真实浏览器，能处理登录态。

评估结论：**v0.7 不真接入 playwright-mcp，登记 v0.8+ 重新评估**。本文解释这个决策的依据。

---

## 评估维度

| 维度 | 评估结果 | 影响 |
|------|----------|------|
| 依赖体积 | `@playwright/test` + `playwright-core` ≈ 8MB JS + bundled 浏览器 ≈ 280MB（chromium-headless-shell Windows 单平台） | 安装包从 ~120MB 涨到 ~400MB |
| 打包影响 | 需 `asarUnpack` 归集 `.local-browsers/**`，且浏览器在 `postinstall` 走外部下载 | 打包失败概率上升 |
| 接入复杂度 | 中等：可走 stdio 子进程（v0.6 已有 MCP 客户端）；CDP 连接需用户手动启动 Chrome | 估 1.5 人日 |
| 与任务模式联动 | playwright 工具是「DOM 操作」路径，与键鼠路径并存 | 架构契合 |
| 离线可用性 | 需首次在线下载 chromium；之后全离线 | 违反本地优先的边缘 |
| 维护风险 | microsoft/playwright-mcp 在 2025 末才稳定 v1.0，API 仍演进 | 中 |

---

## 决策依据

### 1. 打包体积失控

v0.7 的定位是「桌面 Agent 最小可用闭环」，安装包应该轻量。M2 的 nut-js 已经增加了 ~12MB（N-API prebuilt），v0.4 的 canvas 增加了 ~5MB。如果再加 playwright 的 ~280MB chromium bundle，安装包会从 ~120MB 涨到 ~400MB——**3 倍以上的增长**。

更糟的是打包链路：v0.4 的 canvas ABI 血案（Electron 内置 Node ABI 与构建机 Node ABI 不匹配 → dlopen 失败）证明了「原生依赖打包归集」的脆弱性。Playwright 的浏览器下载在 `postinstall` 阶段走外部网络，离线打包需要先 `PLAYWRIGHT_BROWSERS_PATH=0` 缓存再归集——又多一层失败点。

**v0.7 不能为了一个 P1（争取）功能，让 P0 的打包稳定性冒风险**。

### 2. 核心场景已被覆盖

demo② 的用户故事「打开浏览器访问指定网页，把正文存入知识库」，用键鼠路径完全可以完成：

```text
1. app_launch("chrome")           → 启动 Chrome
2. window_focus("Chrome")         → 激活窗口
3. keyboard_type("https://example.com") + keyboard_press("enter")  → 访问网页
4. screen_snapshot                → 确认页面加载
5. fetch_webpage(url)             → 抽正文（v0.6 已有工具）
6. knowledge_search / 文档入库     → 存知识库
```

这条链路不如真 playwright 优雅（需要等页面加载、可能需要滚动），但**闭环可用**。v0.7 的成功指标是「demo 全链路跑通」，不是「浏览器操作精度达到商用水平」。

### 3. 登录态复用 ROI 低

playwright-mcp 真正的优势是「跨会话保留 cookie/profile 的复杂登录态操作」——比如自动登录一个需要两步验证的网站，然后批量爬数据。

但本项目当前阶段的用户故事还没触达这个层级：

- 知识库导入用 fetch_webpage（静态正文）；
- 网页剪藏也是 fetch_webpage；
- 「搜 XX 存前三条」可以用搜索引擎的公开 API 或 fetch_webpage 解析搜索结果页。

键鼠 + screen_snapshot 操作用户已登录的 Chrome（用户手动登录一次，Chrome 保留 cookie），已经能覆盖大部分「需要登录态」的场景——**不需要 playwright 的 CDP 连接**。

### 4. v0.8+ 重新评估窗口

这个决策不是「永远不做浏览器自动化」，而是「v0.7 不做」。v0.7 上线后，如果用户反馈集中在「浏览器操作精度不够」「键鼠操作网页太慢」，v0.8+ 启动浏览器自动化专项时：

- playwright-mcp 已更成熟（v1.x 稳定）；
- 可以重新评估打包体积的取舍（也许那时用户愿意接受 400MB 安装包）；
- 或考虑自研轻量 CDP 工具组（直接用 Chrome DevTools Protocol，避开 Playwright bundle）。

**架构留口保留**：v0.6 的 MCP 客户端 + v0.7 的任务 Agent 循环已为浏览器工具预留接入位（allowedTools 已支持 `mcp:` 前缀），v0.8+ 评估通过后无需架构改动即可挂载。

---

## 与 v0.6 MCP 自实现决策的对比

v0.6 B02 的决策是「自实现 MCP 客户端，弃官方 SDK」——因为官方 SDK 对纯客户端用途硬拉 17 个服务端包。v0.7 的决策是「不接入 playwright-mcp」——因为打包体积和 ROI 不划算。

两个决策的方法论一致：**「为不用的功能付打包税之前，先算清楚自己用到几分之几」**。

v0.6 自实现 MCP 客户端：协议面窄（initialize + tools/list + tools/call），自实现 5 个文件足够；
v0.7 不接入 playwright：核心场景已被键鼠覆盖，playwright 的优势（登录态复用）当前 ROI 低。

**不同的是**：v0.6 的自实现是「做减法」（砍掉不用的依赖），v0.7 的不接入是「做延期」（等需求实了再做）。延期比自实现更保守，因为自实现的代码已经在用，而延期的功能还没有。

---

## 对 demo② 的影响

demo② 的验收路径从「playwright DOM 操作」改为「键鼠 + screen_snapshot + fetch_webpage」：

| 步骤 | 原方案（playwright） | 现方案（键鼠） |
|------|---------------------|---------------|
| 打开浏览器 | `mcp:playwright:browser_navigate` | `app_launch("chrome")` |
| 访问网页 | `mcp:playwright:page_goto(url)` | `keyboard_type(url)` + `keyboard_press("enter")` |
| 确认加载 | `mcp:playwright:page_wait_for_load` | `screen_snapshot` + 模型判断 |
| 抽正文 | `mcp:playwright:page_evaluate("document.body.innerText")` | `fetch_webpage(url)` |
| 存知识库 | `knowledge_search` / 文档入库 | 同左 |

现方案多了「确认加载」这一步（需要模型看截图判断页面是否加载完），但不依赖 playwright，打包体积不增加。

---

## 登记到路线图

在 `docs/roadmap/README.md` 的远期展望里，v0.8+ 增加「浏览器自动化」条目：

> v0.8+「浏览器自动化」—— playwright-mcp 或自研 CDP 工具组
> - 评估 v0.7 键鼠路径的浏览器操作痛点
> - 打包体积与 ROI 重新评估
> - 登录态复用（CDP 连接用户 Chrome）

---

## 一句话总结

v0.7 不接入 playwright-mcp 的决策是「**打包体积优先 + 核心场景已覆盖 + ROI 低**」的三重权衡——不为 P1 功能冒 P0 打包稳定性的风险，不用 280MB 换一个键鼠路径已能完成的场景。核心方法论是 v0.6 自实现 MCP 的延续：**为不用的功能付打包税之前，先算清楚自己用到几分之几**。架构留口保留，v0.8+ 需求实了再做。

下一篇 B09 讲「备份轨加 tasks」：task_runs/task_steps 怎么纳入 v0.4 的四轨备份体系，以及外键校验与幂等恢复的设计。
