# 屏幕感知双通道：截图之外，为什么还要一份 UIA 控件清单

让 AI 操作桌面，先得让它看得见。问题是，只给它一张截图，够吗？

我们的桌面 AI 助手要定位操作目标，先得回答「屏幕上现在是什么」。qwen2.5vl 7B 读一张 1568px 的截图能描述个大概，但要在图里点中「记事本菜单栏的文件选项」这种小目标，坐标输出的方差很大——实测 5 步复合任务纯视觉成功率约 40%。

所以感知从一开始就做成双通道：一张截图给视觉模型「看」，再附一份当前前台窗口的 UIA 控件清单（名称+矩形+类型）作为结构化数据。图和清单一起，为后面的混合定位提供候选源。

## UIA：本来给屏幕阅读器用的接口

UIA（UI Automation）是 Windows 提供的标准无障碍接口，绝大多数标准应用（Win32/WPF/Qt/记事本/资源管理器）都会向 UIA 暴露控件树。它本来是给屏幕阅读器用的，对 Agent 来说却是一份「确定性的控件清单」：控件叫什么、矩形在哪，都是系统给出的精确值，比让模型猜像素坐标可靠得多。

这也是双通道分工的本质：

1. **截图通道**：给视觉模型「看」屏幕的能力；
2. **结构化通道**：截图时附上当前前台窗口的 UIA 控件清单，模型既有图又有数据，混合定位时优先从清单里挑控件。

## 架构：桌面能力住在 Electron 主进程

```text
web server（fork 子进程，纯 Node）
    │ screen_snapshot 工具被调用
    ▼
control-channel client（HTTP POST 到 http://127.0.0.1:PORT/<控制通道路径>/capture）
    │ 带随机 token 鉴权
    ▼
desktop 主进程 control-channel server
    │ computer/screen.ts
    ├─ desktopCapturer.getSources() 抓屏 → 缩放到 1568px 内
    └─ active-window UIA tree → 控件清单（name + rect + type）
    ▼
返回 { imageBase64, mimeType, uiaControls }
```

为什么是主进程作能力宿主？因为 `desktopCapturer` 是 Electron 主进程 API，web server（打包后由主进程 fork 的纯 Node 子进程）没有这个能力。控制通道就是两者之间的桥：

- **协议用 HTTP（127.0.0.1），不用 IPC**。web server 是独立进程，用不了 Electron IPC；HTTP 让通道在 dev 模式（web server 独立跑）和打包模式（主进程 fork）下都能用。
- **随机 token 鉴权**。主进程启动时生成随机 token，通过环境变量 `APP_COMPUTER_TOKEN` 传给 web server；web server 调通道时在 header 里带上。token 只在本机内存流转，不落盘。
- **缺失即降级**。纯 web 模式（没有 desktop 主进程）下，`screen_snapshot` 工具注册时探测通道，探不到就自动隐藏——不报错，只是用户看不到这个工具。

## 截图工具的实现要点

`screen_snapshot` 工具（schema 在 `packages/shared/src/schemas/computer.ts`）：

- **入参**：`scope: 'screen' | 'window' | 'region'` + 可选 `rect`；
- **出参**：`output`（文字摘要）+ `images[]`（PNG base64，附件不入库）；
- **权限**：read 级（只读观察），但截图内容打日志时标注「可能含敏感信息」。

截图处理流水线：

1. `desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: ... })` 拿原生缩略图；
2. 缩放到最大边长 1568px（控制视觉 token 成本——1568 是 qwen2.5vl 推荐的高分辨率阈值，再大收益边际递减）；
3. PNG 编码走 `attachments` 目录落盘（早已就位的附件服务），不入库；
4. 同时调 UIA 拿前台窗口控件清单，附加在工具结果的 `uiaControls` 字段。

**关键决策：截图落盘到 attachments，不存 DB**。一张 1568px PNG 约 200KB-1MB，存数据库会让 task_steps 表膨胀；走附件表加文件系统，DB 只存附件 id 引用。多轨备份体系里的 attachments 轨也天然覆盖这些截图。

## UIA 控件清单：30 行 PowerShell，为什么不用 FFI

UIA 在 Node 侧没有原生绑定，这里用了一个轻量方案：主进程 spawn 一个 PowerShell 脚本调 `System.Windows.Automation` 命名空间，输出 JSON。

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

为什么用 PowerShell 而不是 FFI 直接调 UIA COM？

1. Windows 自带 PowerShell，无需额外依赖；
2. `System.Windows.Automation` 是 .NET 内置，脚本 30 行搞定；
3. 出错时脚本直接以非零码退出，主进程捕获 stderr 后降级为「无 UIA 清单，仅截图」。

控件清单默认只取前台窗口的子树（不遍历整个桌面，避免几百个控件撑爆上下文），并过滤掉 `name` 为空、`rect` 为零的无效控件。

## 纯 web 模式：注册即探测，缺失即隐藏

架构上 `screen_snapshot` 工具注册时就探测通道：

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

`probeComputerChannel` 是对 `127.0.0.1:PORT/ping` 的一次轻量探测，超时 200ms 即判定不可用。这样纯 web 部署（没有 Electron 壳）的用户不会看到一堆「需要桌面端」的工具报错。

## 测试与验证

感知层的测试覆盖：

- **工具 schema**：`computer.test.ts` 验证 `screen_snapshot` 的入参/出参 schema 与权限级；
- **通道鉴权**：无 token / 错误 token 返回 401，正确 token 返回 200；
- **截图缩放**：`resolveRenderScale` 测试不同原始尺寸下的 1568px 缩放比例；
- **UIA 解析**：mock PowerShell 输出，验证控件清单 JSON 解析与无效控件过滤。

桌面 E2E（手测）：启动应用 → 对话输入「看看我屏幕上有什么」→ 助手截图并解读。

## 收尾

屏幕感知用「截图 + UIA 控件清单」双通道给助手装上眼睛，并通过「主进程作能力宿主 + 127.0.0.1 加 token 控制通道」的分层架构，把 Electron 桌面 API 暴露给纯 Node 的 web server。核心取舍是**不把 web server 跑在 Electron 渲染进程里**（那样会失去打包后 fork 独立子进程的灵活性），而是用一个轻量 HTTP 通道桥接——token 鉴权加 127.0.0.1 限制，安全与灵活性都到位。

下一篇讲「手」：键鼠执行——为什么选 @nut-tree-fork/nut-js、点击前的指示圈有什么用，以及任务级批量授权怎么在安全和可用之间取平衡。
