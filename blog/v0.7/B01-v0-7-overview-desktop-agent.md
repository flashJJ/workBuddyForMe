---
title: "看得见、动得了手——WorkBuddy For Me v0.7 总览：桌面 Agent 的眼、手与脑"
series: "WorkBuddy For Me v0.7 技术拆解"
number: "B01"
tags: ["workbuddy", "desktop-agent", "screen-capture", "keyboard-mouse", "task-loop", "overview"]
date: "2026-09"
---

## 先回答：v0.7 为什么是「看得见、动得了手」

v0.6 让助手会接活——MCP 生态接入 + 权限分级 + HITL + 熔断。但「活」的边界仍然在结构化 API 之内：查知识库、抓网页、看时间。对**没有 API 的桌面世界**（记事本、资源管理器、第三方软件的窗口），助手完全没有抓手。

v0.7 的主题「**看得见、动得了手**」：从「对话里调用工具」到「观察屏幕、执行 GUI 操作」，每一步都在用户眼皮底下并经授权。对标腾讯 WorkBuddy 的「接管电脑」能力，但坚持本地优先与安全兜底。

四个里程碑：

| 里程碑 | 内容 | 解决的问题 |
|--------|------|-----------|
| M1 屏幕感知 + 控制通道 | desktopCapturer 截图 + UIA 控件清单双通道；主进程 ↔ web server 本地控制通道 | 看不见 |
| M2 键鼠执行 | @nut-tree-fork/nut-js + 6 个键鼠/窗口工具 + UIA 控件树定位 + SoM 标记兜底 + HITL 任务级批量授权 | 动不了 |
| M3 任务 Agent 循环 | 观察→决策→门控→执行→再观察的循环；步数/失败双上限；急停热键；行动日志落库；任务模式 UI | 长任务无编排 |
| M4 收尾 | 备份轨加 tasks；playwright-mcp 评估（v0.7 不接入，登记 v0.8+）；发布 v0.7.0 | 收尾发布 |

M1-M3 是 P0 主线，M4 是把「有了桌面能力之后」的运维面补齐。

---

## 架构总图

```text
┌────────────── 浏览器渲染进程（Next.js） ──────────────┐
│  任务模式 UI（时间线 + 控制条） /api/tasks/* SSE       │
└────────────────────┬─────────────────────────────────┘
                     │ 127.0.0.1 + token
┌────────────────────▼────────────── web server（fork 子进程）─┐
│  tool-runtime：注册 screen_snapshot / mouse_* / keyboard_*   │
│  task-loop：观察→决策→门控→执行→再观察                        │
└────────────────────┬─────────────────────────────────────────┘
                     │ WBFM_COMPUTER_CHANNEL（127.0.0.1 + token）
┌────────────────────▼──────────────── desktop 主进程 ──────────┐
│  computer/screen.ts（desktopCapturer 抓屏 + UIA 控件清单）      │
│  computer/input.ts（nut-js 键鼠执行 + 半透明指示圈）            │
│  globalShortcut：Ctrl+Alt+Esc → POST /api/tasks/stop-all       │
└───────────────────────────────────────────────────────────────┘
```

三个关键架构事实：

**桌面能力宿主是 Electron 主进程，不是 web**。web server 是纯 Node（打包后由主进程 fork），没有桌面 API。因此架构上是「主进程做能力宿主，web server 经本地控制通道调用」——通道用 127.0.0.1 + 随机 token 鉴权，纯 web 模式（无 desktop）下工具注册即探测通道，缺失时隐藏。

**桌面工具与内置工具同链**。`screen_snapshot`、`mouse_click` 等直接注册进 v0.6 已有的 tool-runtime 统一表，模型看到的 tool_calls schema 与 `current_time` 无异。权限复用 v0.6 的 read/write/danger 三级——键鼠工具统一 danger 级，复用整套 HITL 确认链路。

**任务循环是新的顶层状态机，不是 tool-call-loop 的扩展**。对话是「一问一答 + 工具调用」；任务是「给一个目标，循环观察决策直到完成或喊停」。两者 SSE 事件通道共用，但循环骨架独立（core/agent/task-loop.ts），步数/失败双上限、熔断联动、急停都在这个骨架里。

---

## 关键决策速览

**nut-js 选型，弃 robotjs**。robotjs 停更 5 年 + NAN 老架构无现代 prebuilt，node 24 ABI 下编译即炸；`@nut-tree-fork/nut-js` 是社区维护的 N-API prebuilt 版本，跨 ABI 稳定。详见 B03。

**坐标定位混合分层：UIA 控件树优先 → SoM 编号标记兜底 → 纯坐标最终兜底**。qwen2.5vl 7B 纯视觉 5 步复合任务成功率约 40%，不能单押。UIA 控件树拿目标应用控件名+精确矩形是确定性定位，覆盖标准 Win32/WPF/Qt 应用；自绘 UI/Electron 窗口拿不到控件时，截图叠加编号标记，模型选编号而非输出像素坐标，把回归问题变分类问题。详见 B04。

**任务循环的生命周期由 SSE /events 拥有，不是 POST 创建时启动**。POST /api/tasks 只创建 queued run；前端开 EventSource 订阅 /events 时才启动循环；客户端断线 → request.signal abort → 循环以 user_stop 终态退出。急停热键即使循环未活跃也安全（stopAll 返回 0）。详见 B05。

**playwright-mcp 评估未接入 v0.7**。打包体积会涨 ~280MB（chromium bundle），且核心场景已被键鼠+screen_snapshot+fetch_webpage 覆盖。架构留口保留（allowedTools 已支持 mcp: 前缀），v0.8+ 重新评估。详见 B08。

---

## Non-Goals

- 完全无确认的自主执行（安全红线：danger 动作必须至少任务级授权一次）
- 远程控制其他设备 / 移动端
- 游戏与 3D 应用操作（DirectX 独占渲染截图黑屏，ROI 极低）
- 多智能体编排（归 v0.8）
- 云端模型强制依赖（任务模式可用本地视觉模型全离线跑，云端仅作可选加速）

---

## 测试基线

合入前全部门禁绿：check（typecheck + lint + 文件 ≤300 行）/ 单测 12 包 390+ 测 / 集成 12 / E2E 7/7。任务循环模块含状态机/上限/熔断联动 60+ 测；UIA 控件树 + SoM 标记各 15 测；急停热键 + stop-all 路由在 tasks.test 5 测覆盖。

手测验收（demo① 待补）：启动记事本写一段话保存——走 UIA 定位「记事本」窗口、keyboard_type 输入、keyboard_press Ctrl+S 保存。

---

## 一句话总结

v0.7 把助手的「手」和「眼」接到了桌面上——**屏幕感知给眼睛，键鼠执行给手，任务循环给脑**，并用「HITL 任务级授权 + 步数/失败双上限 + 全局急停热键」三层安全网回答了「桌面操作怎么不失控」。核心取舍仍然是本地优先：宁可走 Electron 主进程作能力宿主的分层架构，也不依赖云端视觉服务。

下一篇 B02 讲 v0.7 的「眼睛」：屏幕感知与控制通道——desktopCapturer 抓屏 + UIA 控件清单双通道，以及 web server 怎么经本地控制通道调用主进程能力。
