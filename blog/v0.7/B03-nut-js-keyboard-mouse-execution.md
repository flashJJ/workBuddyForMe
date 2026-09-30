---
title: "键鼠执行：为什么选 @nut-tree-fork/nut-js，点击指示圈与任务级批量授权"
series: "WorkBuddy For Me v0.7 技术拆解"
number: "B03"
tags: ["workbuddy", "desktop-agent", "nut-js", "keyboard-mouse", "hitl", "task-grants"]
date: "2026-09"
---

## 选型：三选一的账

v0.7 M2 要做键鼠执行。三个候选：

| 方案 | 状态 | ABI 兼容 | 跨平台 | 打包 |
|------|------|----------|--------|------|
| robotjs | 停更 5 年 | NAN 老架构，node 24 ABI 编译即炸 | 是 | 无 prebuilt，需本地编译 |
| @nut-tree/nut-js | 原作者停更 | N-API，但 prebuilt 不全 | 是 | prebuilt 覆盖不全 |
| @nut-tree-fork/nut-js | 社区维护 | N-API prebuilt 跨 ABI | 是 | prebuilt 全 |
| koffi + Win32 SendInput | FFI 无 ABI 问题 | 无 native 编译 | Windows-only | 无 prebuilt 问题 |

**最终选 `@nut-tree-fork/nut-js`**。决策依据：

1. **robotjs 出局**：停更 + NAN 老架构，node 24（ABI 137）下编译失败，且社区无人维护，CVE 响应无门。
2. **原 nut-js 出局**：prebuilt 覆盖不全，部分平台需本地编译，与 v0.4 canvas 归集经验一致——「需本地编译的原生依赖是打包定时炸弹」。
3. **fork 版入选**：社区维护的 N-API prebuilt 版本，跨 ABI 稳定，与 better-sqlite3 同代架构，electron-builder 配 `asarUnpack` 归集 `.node` 文件即可。
4. **koffi+SendInput 留作回退**：如果 fork 版打包炸链，回退到 koffi FFI 调 Win32 `SendInput`（Windows-only 可接受，因为 v0.7 桌面 Agent 目前只支持 Windows）。

**打包 spike 防坑**：M2 第一天先做打包 spike——打包后 exe 内跑通点击 demo 再展开。这是从 v0.4 canvas ABI 血案（Electron 内置 Node ABI 与构建机 Node ABI 不匹配 → dlopen 失败）学来的纪律：**原生依赖先验证打包链路，再写业务代码**。

---

## 六个键鼠/窗口工具

M2 实现了 10 个工具（`packages/shared/src/constants.ts` TOOL_NAMES）：

| 工具 | 权限 | 说明 |
|------|------|------|
| `mouse_move(x, y)` | danger | 移动鼠标到屏幕坐标 |
| `mouse_click(x, y, button, double)` | danger | 点击（左键/右键/中键，可双击） |
| `mouse_scroll(dx, dy)` | danger | 滚轮 |
| `keyboard_type(text)` | danger | 输入文本 |
| `keyboard_press(keys)` | danger | 组合键（如 `['ctrl','s']`） |
| `window_list()` | read | 列出所有窗口（标题+句柄+矩形） |
| `window_focus(hwnd)` | read | 激活指定窗口 |
| `uia_list(hwnd?)` | read | UIA 控件清单（M1 已实现，M2 暴露为工具） |
| `app_launch(name)` | danger | 按名启动应用（如 `notepad`） |

`mouse_move` 和 `mouse_click` 分离是有意的：移动是独立动作（给视觉模型「看指针在哪」的反馈），点击才是危险动作。`window_list`/`window_focus`/`uia_list` 是 read 级，因为只读观察不产生副作用。

---

## 点击指示圈：让用户看到「要点哪」

键鼠操作是 danger 级，默认逐步 HITL 确认。但弹窗只告诉用户「我要点击 (800, 600)」——用户对坐标没有直觉。

v0.7 M2 加了**半透明指示圈**：执行前 300ms 延迟，在屏幕对应位置绘制一个 30px 半透明红色圆圈 + 十字准星，持续 500ms 后执行动作。

实现：主进程用 Electron `BrowserWindow` 创建一个无边框、透明、置顶的 overlay 窗口，CSS 画圈，`setPosition` 到目标坐标。300ms 延迟是给用户反应时间（也给 HITL 弹窗点击「允许」的时间），500ms 后关闭 overlay 并执行动作。

指示圈是**用户体验与安全的双重设计**：既让用户直观看到「助手要点哪」，也给用户一个「在这 500ms 内按急停热键」的窗口。

---

## 任务级批量授权：remember='task'

v0.6 的 HITL 授权记忆有三个级别：`once`（本次）/ `assistant`（该助手永久）/ `global`（全局）。键鼠工具如果每步都弹窗，20 步任务要点 20 次「允许」——不可用。

v0.7 扩展了 `remember='task'`：

- **任务级白名单**：用户在第一个键鼠工具弹窗选「本任务内一直允许」后，该 runId 内的同权限级工具不再弹窗；
- **作用域**：`taskGrants` 存在 core 的 `TaskGrantsService`，key 是 `runId:permission`；
- **生命周期**：任务终态（completed/failed/stopped）时 `taskGrants.clear(runId)` 自动清理；
- **急停联动**：急停热键触发时也清理所有 taskGrants，防止急停后残留授权被复用。

这是「安全与可用性的平衡点」：danger 动作仍需授权，但授权粒度从「每步」放宽到「每任务」——用户对任务目标点头一次，助手在任务内自主执行。

---

## HITL 弹窗与任务循环的联动

键鼠工具的 HITL 流程：

```text
task-loop 执行到 mouse_click
    │
    ▼
gateToolPermission 检查：
  ├─ 工具已熔断 → 拒绝（任务终止）
  ├─ taskGrants 有 runId:danger 授权 → 直接放行
  └─ 否则 → 发 task 事件 step_started + HITL 挂起
                │
                ▼
          前端渲染弹窗：
          - 工具名 + 参数摘要（如「点击 (800,600) 左键」）
          - 指示圈显示在屏幕上
          - 三按钮：拒绝 / 本次允许 / 本任务一直允许
                │
                ▼
          用户选择 → POST /api/tools/confirm
                │
                ▼
          pending-confirmations.resolve(callId, decision)
                │
                ▼
          task-loop 继续执行（或终止）
```

120 秒无响应自动拒绝（v0.6 已实现的挂起注册表超时机制），防止任务卡死。

---

## 测试与验证

M2 测试：

- **工具 schema**：10 个工具的入参/出参/权限级断言；
- **UIA 控件树定位**：mock UIA 输出，验证从控件名 → 矩形中心坐标的映射；
- **SoM 标记**：`som-marker.test.ts` 15 测，验证编号叠加 + 坐标回算；
- **task-grants**：`task-grants.test.ts` 2 测，验证任务级授权的设置/查询/清理。

桌面 E2E（手测）：启动记事本 → 鼠标点击编辑区 → keyboard_type 输入文本 → keyboard_press Ctrl+S 保存。

---

## 一句话总结

v0.7 M2 用 `@nut-tree-fork/nut-js` 给助手装上手，并通过「点击指示圈 + 任务级批量授权」让危险操作既可控又可用。核心取舍是**分层定位（UIA 优先 → SoM 兜底 → 纯坐标最终）+ 分层安全（HITL 确认 + 任务级授权 + 急停）**——定位精度靠混合策略，安全靠多层兜底，单押任何一层都会掉点。

下一篇 B04 讲「混合定位」：UIA 控件树确定性定位 + SoM 编号标记视觉兜底的完整策略，以及为什么纯坐标是最终兜底而非首选。
