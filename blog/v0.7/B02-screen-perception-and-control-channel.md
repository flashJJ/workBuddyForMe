---
title: "屏幕感知与控制通道：desktopCapturer 抓屏 + UIA 控件清单，以及 web server 怎么调主进程"
series: "WorkBuddy For Me v0.7 技术拆解"
number: "B02"
tags: ["workbuddy", "desktop-agent", "desktopCapturer", "uia", "control-channel", "screen-snapshot"]
date: "2026-09"
---

## 为什么要双通道感知

v0.7 的第一个问题是「看不见」。助手对桌面状态零感知，无法回答「屏幕上现在是什么」，更无法基于视觉定位操作目标。

单通道（只截图）的问题：qwen2.5vl 7B 读一张 1568px 的截图能描述大概，但要在图里定位「记事本菜单栏的文件选项」这种小目标，坐标输出的方差很大——5 步复合任务纯视觉成功率约 40%。

所以 v0.7 M1 做了**双通道感知**：

1. **截图通道**：给视觉模型「看」屏幕的能力；
2. **结构化通道**：截图时附上当前前台窗口的 UIA 控件清单（名称+矩形+类型），模型既有图又有结构化数据，为 M2 混合定位提供候选源。

UIA（UI Automation）是 Windows 提供的标准无障碍接口，绝大多数标准应用（Win32/WPF/Qt/记事本/资源管理器）都会向 UIA 暴露控件树——它本来是给屏幕阅读器用的，但对 Agent 来说是「确定性的控件清单」，比像素坐标可靠得多。

---

## 架构：主进程作能力宿主

```text
web server（fork 子进程，纯 Node）
    │ screen_snapshot 工具被调用
    ▼
control-channel client（HTTP POST 到 127.0.0.1:PORT/WBFM_COMPUTER_CHANNEL/capture）
    │ 带随机 token 鉴权
    ▼
desktop 主进程 control-channel server
    │ computer/screen.ts
    ├─ desktopCapturer.getSources() 抓屏 → 缩放到 1568px 内
    └─ active-window UIA tree → 控件清单（name + rect + type）
    ▼
返回 { imageBase64, mimeType, uiaControls }
```

为什么是主进程作能力宿主？因为 `desktopCapturer` 是 Electron 主进程 API，web server（打包后由主进程 fork 的纯 Node 子进程）没有这个能力。控制通道是两者之间的桥：

- **协议**：HTTP（127.0.0.1），不是 IPC。因为 web server 是独立进程，不能用 Electron IPC；HTTP 让通道在 dev 模式（web server 独立跑）和打包模式（主进程 fork）下都能用。
- **鉴权**：主进程启动时生成随机 token，写入 web server 启动环境变量 `WBFM_COMPUTER_TOKEN`；web server 调通道时在 header 带 token。token 只在本机内存流转，不落盘。
- **降级**：web-only 模式（无 desktop 主进程）下，`screen_snapshot` 工具注册时探测通道，缺失时工具自动隐藏——不报错，只是用户看不到这个工具。

---

## 截图工具的实现要点

`screen_snapshot` 工具（schema 在 `packages/shared/src/schemas/computer.ts`）：

- **入参**：`scope: 'screen' | 'window' | 'region'` + 可选 `rect`；
- **出参**：`output`（文字摘要）+ `images[]`（PNG base64，附件不入库）；
- **权限**：read 级（只读观察），但截图内容打日志时标注「可能含敏感信息」。

截图处理流水线：

1. `desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: ... })` 拿原生缩略图；
2. 缩放到最大边长 1568px（控制视觉 token 成本——1568 是 qwen2.5vl 推荐的高分辨率阈值，再大收益边际递减）；
3. PNG 编码走 `attachments` 目录落盘（v0.3 已有的附件服务），不入库；
4. 同时调 UIA 拿前台窗口控件清单，附加在工具结果的 `uiaControls` 字段。

**关键决策：截图落盘到 attachments，不存 DB**。一张 1568px PNG 约 200KB-1MB，存数据库会让 task_steps 表膨胀；走附件表 + 文件系统，DB 只存附件 id 引用。v0.4 M4 备份轨的 attachments 轨天然覆盖这些截图。

---

## UIA 控件清单的实现

UIA 在 Node 侧没有原生绑定，v0.7 用了一个轻量方案：主进程 spawn 一个 PowerShell 脚本调 `System.Windows.Automation` 命名空间，输出 JSON。

```text
主进程 control-channel server 收到 capture 请求
    │
    ├─ desktopCapturer 截图（异步）
    └─ spawn pwsh -File get-uia-tree.ps1（并行）
         │
         └─ AutomationElement.RootElement → 遍历前台窗口子树
              → 每个控件输出 { name, controlType, rect: {x,y,w,h} }
         │
         └─ JSON stdout
    ▼
合并 { image, uiaControls } 返回
```

为什么用 PowerShell 而不是 FFI 调 UIA COM？因为：

1. Windows 自带 PowerShell，无需额外依赖；
2. `System.Windows.Automation` 是 .NET 内置，脚本 30 行搞定；
3. 出错时脚本直接退出非零，主进程捕获 stderr 降级为「无 UIA 清单，仅截图」。

控件清单默认只取前台窗口的子树（不遍历整个桌面，避免几百个控件撑爆上下文），并过滤掉 `name` 为空、`rect` 为零的无效控件。

---

## 纯 web 模式的降级

架构上 `screen_snapshot` 工具注册即探测通道：

```ts
// tool-runtime 注册时
const channelAvailable = await probeComputerChannel();
if (channelAvailable) {
  registerTool(screenSnapshotTool);
} else {
  // 不注册，用户看不到这个工具
  console.info('[computer] 控制通道不可用，screen_snapshot 工具已隐藏（web-only 模式）');
}
```

`probeComputerChannel` 是对 `127.0.0.1:PORT/ping` 的轻量探测，超时 200ms 即判定不可用。这样纯 web 部署（无 Electron）的用户不会看到一堆「需要桌面端」的工具报错。

---

## 测试与验证

M1 的测试覆盖：

- **工具 schema**：`computer.test.ts` 验证 `screen_snapshot` 的入参/出参 schema 与权限级；
- **通道鉴权**：无 token / 错误 token 返回 401，正确 token 返回 200；
- **截图缩放**：`resolveRenderScale` 测试不同原始尺寸下的 1568px 缩放比例；
- **UIA 解析**：mock PowerShell 输出，验证控件清单 JSON 解析 + 无效控件过滤。

桌面 E2E（手测）：启动应用 → 对话输入「看看我屏幕上有什么」→ 助手截图 + 解读。

---

## 一句话总结

v0.7 M1 用「截图 + UIA 控件清单」双通道给助手装上眼睛，并通过「主进程作能力宿主 + 127.0.0.1+token 控制通道」的分层架构，把 Electron 桌面 API 暴露给纯 Node 的 web server。核心取舍是**不把 web server 跑在 Electron 渲染进程里**（那样会失去打包后 fork 独立子进程的灵活性），而是用一个轻量 HTTP 通道桥接——token 鉴权 + 127.0.0.1 限制，安全与灵活性都到位。

下一篇 B03 讲「手」：键鼠执行——为什么选 @nut-tree-fork/nut-js、UIA 控件树定位、以及点击指示圈的视觉反馈。
