---
title: "v0.7 复盘：桌面 Agent 的选型账、安全网设计、以及给 v0.8 铺的路"
series: "WorkBuddy For Me v0.7 技术拆解"
number: "B10"
tags: ["workbuddy", "retrospective", "desktop-agent", "nut-js", "safety", "methodology"]
date: "2026-09"
---

## 复盘一：原生依赖选型的账，结论前置

v0.7 最重要的选型决策是 B03 的键鼠执行库选型。三个候选（robotjs / nut-js / koffi+SendInput），最终选 `@nut-tree-fork/nut-js`。

完整算一次账：

**robotjs 的成本**：停更 5 年 + NAN 老架构，node 24（ABI 137）下编译即炸，且 CVE 响应无门。出局原因不是「不好用」，是「已死」。

**原 nut-js 的成本**：prebuilt 覆盖不全，部分平台需本地编译。与 v0.4 canvas 归集经验一致——「需本地编译的原生依赖是打包定时炸弹」。

**fork 版 nut-js 的成本**：社区维护的 N-API prebuilt，跨 ABI 稳定，与 better-sqlite3 同代架构。打包只需 `asarUnpack` 归集 `.node` 文件。

**koffi+SendInput 的成本**：FFI 无 ABI 问题，Windows-only。作为回退方案保留——如果 fork 版打包炸链，回退到 koffi。

这条决策方法论可以泛化：**原生依赖的选型，「prebuilt 覆盖」比「API 设计」更重要**。API 不好用可以封装，prebuilt 不全就得本地编译——而本地编译在用户机器上是不可控的（编译器、Python 版本、网络）。

---

## 复盘二：安全网的三层设计

v0.7 的桌面操作是 danger 级，安全是红线。三层安全网：

1. **HITL 任务级授权**：danger 动作默认逐步确认，用户可选「本任务内一直允许」放宽到任务级；
2. **步数/失败双上限**：maxSteps=20 防失控，TASK_MAX_FAILURES=3 防死循环；
3. **全局急停热键**：Ctrl+Alt+Esc 穿透所有挂起点终止循环。

这三层的设计哲学是「**逐层放宽，逐层兜底**」：

- 默认最严（每步确认），用户信任后放宽（任务级授权）；
- 放宽后仍有上限（步数/失败），上限后仍有急停（热键）；
- 急停是最后一道，物理边界内（已发出的动作无法撤回）靠「点击前 300ms 延迟 + 指示圈」补。

**核心洞察**：安全不是「一刀切禁止」，而是「在用户可接受的风险等级下提供可控的自主度」。每步确认最安全但不可用（20 步要点 20 次），任务级授权可用但有风险（助手可能误操作）——两者之间的平衡靠上限和急停兜底。

---

## 复盘三：混合定位的「把问题改写成模型擅长的形式」

B04 的混合定位策略（UIA → SoM → 纯坐标）的核心洞察是「**不要让 7B 模型做它不擅长的事**」。

7B 模型不擅长精确坐标回归（误差 ±50px），但擅长：
- 从控件清单里选名字（分类）；
- 从编号里选一个（分类）。

UIA 和 SoM 本质上都是「**把回归问题改写成分类问题**」：UIA 让模型选控件名，SoM 让模型选编号。坐标由确定性逻辑（矩形中心 / 编号区域中心）计算，不由模型输出。

这个洞察可以泛化到所有「小模型 + 精确输出」的场景：**不要逼模型输出精确数值，而是给它一组候选让它选**。候选由确定性逻辑生成，模型只做选择——选择的准确率远高于数值回归。

---

## 复盘四：playwright-mcp 不接入的「延期」方法论

B08 的决策是「v0.7 不接入 playwright-mcp，登记 v0.8+ 重新评估」。

这与 v0.6「自实现 MCP 客户端」的决策方法论一致但方向不同：

- v0.6 自实现：做减法（砍掉不用的依赖），因为协议面窄；
- v0.7 不接入：做延期（等需求实了再做），因为 ROI 低。

**延期比自实现更需要勇气**：自实现的代码已经在用，能看到价值；延期的功能还没有，容易被「为什么不做」质疑。但延期的依据是实的：打包体积涨 3 倍、核心场景已被键鼠覆盖、登录态复用 ROI 低——这三条任何一条都足以支撑延期。

**架构留口是延期的前提**：如果延期意味着「以后要大改架构」，那延期的成本太高。v0.7 的 MCP 客户端 + 任务循环已为浏览器工具预留接入位（allowedTools 支持 `mcp:` 前缀），v0.8+ 评估通过后无需架构改动——**留口让延期的成本接近于零**。

---

## v0.7 给 v0.8 铺的路

| v0.7 铺的 | v0.8 长的 |
|---|---|
| 任务 Agent 循环 + 行动日志 | 任务模板与录制回放（P1-2） |
| 混合定位（UIA + SoM） | UI-TARS-7B 等专用 grounding 模型评估 |
| 键鼠工具 + HITL 任务级授权 | 浏览器自动化（playwright-mcp 或自研 CDP） |
| 急停热键 + stop-all | 多任务并行调度（当前单任务串行） |
| screen_snapshot + UIA 双通道 | 跨窗口/跨显示器的全局感知 |

回头看，v0.7 的「眼 + 手 + 脑 + 安全网」是为「桌面 Agent 更复杂的任务」准备的——而 v0.8 的浏览器自动化、任务模板、多智能体编排正是在这个骨架上生长。**每个版本的收尾件，往往是下个版本的地基**（v0.6 B10 的结论在 v0.7 得到验证）。

---

## 全系列索引

- [B01 总览：看得见、动得了手——桌面 Agent 的眼、手与脑](file:///e:/code/traeWork/workBuddyForMe/blog/v0.7/B01-v0-7-overview-desktop-agent.md)
- [B02 屏幕感知与控制通道：desktopCapturer 抓屏 + UIA 控件清单](file:///e:/code/traeWork/workBuddyForMe/blog/v0.7/B02-screen-perception-and-control-channel.md)
- [B03 键鼠执行：为什么选 @nut-tree-fork/nut-js，点击指示圈与任务级批量授权](file:///e:/code/traeWork/workBuddyForMe/blog/v0.7/B03-nut-js-keyboard-mouse-execution.md)
- [B04 混合定位策略：UIA 控件树优先，SoM 编号标记兜底，纯坐标最终兜底](file:///e:/code/traeWork/workBuddyForMe/blog/v0.7/B04-hybrid-locating-uia-som-coordinate.md)
- [B05 任务 Agent 循环：观察→决策→门控→执行→再观察，以及步数/失败双上限与急停](file:///e:/code/traeWork/workBuddyForMe/blog/v0.7/B05-task-agent-loop-and-safety-guards.md)
- [B06 急停：Ctrl+Alt+Esc 从主进程到循环终止的端到端链路](file:///e:/code/traeWork/workBuddyForMe/blog/v0.7/B06-emergency-stop-hotkey-and-stop-all.md)
- [B07 行动日志：task_runs/task_steps 表设计、SSE 事件落库一致性与终态回放](file:///e:/code/traeWork/workBuddyForMe/blog/v0.7/B07-task-runs-steps-and-terminal-replay.md)
- [B08 浏览器自动化评估：为什么 v0.7 没有接入 playwright-mcp，以及打包体积与 ROI 的权衡](file:///e:/code/traeWork/workBuddyForMe/blog/v0.7/B08-playwright-mcp-evaluation-not-adopted.md)
- [B09 备份轨加 tasks：task_runs/task_steps 纳入四轨体系，外键校验与幂等恢复](file:///e:/code/traeWork/workBuddyForMe/blog/v0.7/B09-backup-track-tasks-foreign-key-idempotent.md)
- B10 本篇：v0.7 复盘

---

## 一句话总结

v0.7 把助手的「手」和「眼」接到了桌面上，用「混合定位 + 三层安全网 + 任务循环」证明了一件事：**桌面操作的失控风险不是靠「禁止」来规避，而是靠「逐层放宽 + 逐层兜底」来管理**——用户信任后放宽到任务级授权，放宽后有上限兜底，上限后有急停兜底。核心取舍仍然是本地优先：宁可走 Electron 主进程作能力宿主的分层架构，也不依赖云端视觉服务；宁可延期 playwright-mcp，也不为 P1 功能冒 P0 打包稳定性的风险。

v0.8 将在这个骨架上长出浏览器自动化、任务模板与多智能体编排，那是本系列下一个故事。
