---
title: "数据随身——WorkBuddy v0.4 五件事总览：备份、分享、更新、OCR、命令面板"
series: "WorkBuddy v0.4 技术拆解"
number: "B01"
tags: ["workbuddy", "backup", "share", "auto-update", "ocr", "overview"]
date: "2025-Q4"
---

## 先回答：v0.4 为什么是「数据随身」

v0.3 做完，WorkBuddy 已经能读截图、读 Office、读网页——信息**进得来**了。但用了两个月之后，另一种别扭越来越明显：

> 数据进得来，出不去。

具体是四个场景：

1. **换机/重装**：所有会话、知识库、设置都锁在 `~/.workbuddy-for-me/` 一个 SQLite 文件加一堆附件里。手工拷贝目录不算备份——没有校验、没有选择性、跨版本 schema 不兼容随时可能崩。
2. **好对话无法分享**：和助手讨论出一个完整技术方案，想发给同事，只能截图。截图不体面，代码高亮、工具过程、引用角标全部丢失。
3. **桌面端不会自己更新**：v0.3 修了三个线上 bug，已安装用户必须手动重新下载 exe 替换。一个只有作者自己在用的应用，连作者自己都嫌烦。
4. **扫描件 PDF 是断崖**：v0.3 的 P1 留白——纯图片、没有文字层的 PDF，抽出来是空文本，文档直接失败。知识库里那批手机拍的合同、扫描的书，全部进不来。

v0.4 的主题因此定为「**数据随身**」：数据要能打包带走（备份）、能体面外发（分享）、应用能自己跟上新版本（自动更新），外加补上扫描件 OCR 这块最后的摄入短板。最后顺手做了重度用户催了很久的 **Ctrl+K 命令面板**。

五个模块，22 个提交，83 个文件，+6016 行，一个数据库迁移（v4）。这篇是总览，后续 B02~B10 每个点拆到底。

---

## 五件事一览

| 模块 | 代号 | 优先级 | 解决的问题 |
|------|------|--------|-----------|
| 备份与恢复 | M1 | P0 | 四轨道可选导出 `.wbfm-backup`（tar.gz），合并式恢复、向量按需重建 |
| 对话分享 | M2 | P0 | 单会话导出 Markdown / 单文件 HTML，密钥与本地路径一律脱敏 |
| 桌面自动更新 | M3 | P0 | electron-updater + GitHub Releases，检查/下载/安装/重启全自动 |
| 图片型 PDF OCR | M4 | P1 | 视觉模型优先逐页识别，无视觉模型时 tesseract.js 离线兜底 |
| 命令面板 | M5 | P1 | Ctrl+K 唤起、模糊搜索、键盘流操作，Electron 全局快捷键 |

P0 三件构成「数据随身」的闭环；P1 两件是投入产出比明确的硬补强。P2 里的备份加密、增量备份、PDF 分享、OCR 人工校正全部登记不做——一个人的项目，主题闭环比功能数量重要。

---

## 模块依赖拓扑

五个模块几乎是五条平行线，只在两个底座上汇合，这也是它们能被拆成五个独立里程碑、各自验收的原因：

```
   ┌──────────────────── packages/shared 契约层 ────────────────────┐
   │ backup.ts(manifest Zod)  command.ts(Command/fuzzyMatch)         │
   │ OCR 枚举(partial/ocrStatus/ocrEngine)  updater 状态类型           │
   └───────┬─────────────────┬──────────────────┬────────────────────┘
           ▼                 ▼                  ▼
  ┌────────────────┐ ┌────────────────┐ ┌──────────────────────────┐
  │ M1 备份恢复     │ │ M2 对话分享     │ │ M3 自动更新               │
  │ backup/         │ │ share/          │ │ desktop/main/updater.ts  │
  │ export/restore  │ │ snapshot 脱敏    │ │ updater-state + IPC 桥    │
  └───────┬────────┘ └───────┬────────┘ └────────────┬─────────────┘
          │  纯 core，无 UI 耦合   │  HTML/MD 序列化在 web  │  只活在 Electron 主进程
          ▼                  ▼                        ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ M4 OCR：read-document → vision/tesseract → 现有摄入管线零旁路      │
  │ M5 命令面板：shared 契约 → web 面板 → desktop globalShortcut      │
  └─────────────────────────────────────────────────────────────────┘
```

两个值得注意的拓扑事实：

- **M1/M2 共用一套「序列化 + 脱敏」语言**。备份的四轨 JSON 和分享的会话快照面对的是同一类问题：怎么把 DB 行变成可外发的、不含密钥的文本。脱敏纯函数（`snapshot.ts` 的 `sanitizeShareText`）一次写成纯函数，两个场景共用。
- **M4 是摄入管线的内部替换**。OCR 产出的仍然是纯文本，从 `extractDocumentText` 出来之后，分片、嵌入、sqlite-vec 落库、RAG 检索一行都不用改。这条「禁止另起炉灶」的铁律从 v0.3 Office 解析延续至今。

---

## M1 备份与恢复：tar.gz 里的四条轨道

备份归档实际就是一个 gzip 压缩的 tar（`.wbfm-backup` 只是习惯后缀），根目录一份 `manifest.json` 加四条轨道的 JSON：

```
manifest.json          # 备份 schema 版本、源应用版本、创建时间、各轨道条目数
conversations.json     # 会话 + 消息（含 content_parts、tool_trace）
knowledge.json         # 知识库 + 文档元数据 + 分片原文
settings.json          # 模型/供应商配置（密钥字段脱敏，不备份密文）
attachments/           # 附件二进制（可选轨道，按 sha256 文件名存放）
```

契约在 [backup.ts](file:///e:/code/traeWork/workBuddyForMe/packages/shared/src/backup.ts) 用 Zod 钉死，`backupSchemaVersion` 从 1 起步单调递增——未来恢复端按版本探测走迁移适配器链，这是给未来的自己留的路。

三个关键决策：

**1. 合并而非覆盖。** 恢复不是「清空再导入」：会话按 ID 跳过已存在项，知识库按 content hash 去重，重复恢复同一个归档不会产生双胞胎数据。整个写入包在一个 DB 事务里，任何一条失败整体回滚，不会留下半个库。

**2. 备份里不存向量。** `knowledge.json` 只存分片原文，不存 embedding。向量是可再生产物——存它只会让归档体积膨胀数倍，且换了 embedding 模型维度不兼容（v0.3 的 `ensureVectorTable` 本来就会拒绝维度冲突）。恢复后标记 `needs_reindex`，用当前配置的 embedding 模型重新嵌入即可。

**3. 先 precheck 再动手。** 恢复 API 分两步：先上传归档做预检查（版本兼容性、轨道完整性、将导入 N 个会话/M 个文档、磁盘空间），前端弹确认框，用户点头后才执行真正写入。「先报告将要发生什么，再让它发生」对破坏性操作是底线。

过程中还踩了个小坑：tar 的 pipe 顺序写反会导致归档条目错乱，以及 `description` 字段 nullable 没兜底——两个都是真机 round-trip 才暴露的，各一个 fix 提交。

---

## M2 对话分享：一个 HTML 文件就是终点

不做在线分享链接是刻意的：单用户本地优先，不引入云存储。导出的文件即最终产物，用户自己选择发给谁、用什么渠道。

链路分两层：

- **core 快照层**：[export-conversation.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/share/export-conversation.ts) 从 DB 拉完整会话（消息、contentParts、工具轨迹、引用），图片附件解析成 data URL 内嵌，然后对**所有文本字段**统一脱敏。
- **web 序列化层**：Markdown 序列化器（角色标注、代码块、工具过程渲染成引用块、引用变脚注）和单文件 HTML 序列化器（内联 CSS，双击即可在任意浏览器阅读，不依赖任何服务）。

脱敏是这个模块最该认真的地方，四条正则规则全部在纯函数里单测覆盖：

1. 本地数据根目录路径（Windows 盘符路径 / Unix 路径 / `~` 路径）→ `[REDACTED]`
2. `sk-xxx` 风格 API Key → `[REDACTED]`
3. Bearer/Basic 令牌 → `[REDACTED]`
4. `api_key/token/secret/password` 赋值串（JSON、env、header 三种常见形态）→ `[REDACTED]`

文件尾部统一附「由 WorkBuddy For Me v0.4.0 生成」水印。分享出去的东西默认假设会被陌生人看到——这是威胁模型，不是强迫症。

---

## M3 自动更新：开发态 no-op，生产态全自动

[updater.ts](file:///e:/code/traeWork/workBuddyForMe/apps/desktop/src/main/updater.ts) 封装 electron-updater，对接 GitHub Releases。设计上最要紧的是一条边界：**`app.isPackaged` 门控——开发态所有更新检查是 no-op**，否则开发时 electron-updater 会去抢正在跑的 dev 进程。

状态流是显式的有限状态机，而不是随意的事件转发：

```
idle → checking → available → downloading(进度 0~100%) → downloaded
                ↘ not-available                    ↘ error（不阻塞使用，附手动下载链接）
```

通道偏好（stable/beta）持久化在状态文件里，构造 Updater 时同步到 `allowPrerelease`。autoUpdater 的事件被收敛成 `UpdateStatus` 经 IPC 转发渲染进程；无窗口时静默丢弃，绝不让更新逻辑阻塞主进程。测试通过注入 `AutoUpdaterLike`（一个 EventEmitter 子集接口）完成，不依赖真实 electron——这种「把第三方单例藏在接口后面」的手法在 v0.1 接 cipher-server 时就验证过了。

打包侧 `electron-builder.yml` 加 `publish: github`，`latest.yml` 由 builder 自动生成随 release 上传。未签名 exe 的 SmartScreen 问题仍留给 v1.0 证书，本期不碰。

---

## M4 图片型 PDF OCR：本期踩坑最深的模块

OCR 判定与执行链路：

```
read-document 取文字层
  → 逐页算字符密度，< 50 字符/页判为需要 OCR
  → 有视觉模型？→ pdfjs 渲染 PNG → 视觉模型逐页转录（主路线）
  → 没有？     → @napi-rs/canvas 渲染 → tesseract.js WASM 离线识别（兜底）
  → 产出纯文本 → 复用原有分片/嵌入/向量管线
```

状态契约在 v4 迁移里：`documents` 加 `ocr_status`（running/done/failed/skipped）和 `ocr_engine`（vision/tesseract）两列，老文档一律 NULL 表示「非 OCR 来源」。单页超时 30s 跳过、全文上限 50 页、总超时 5 分钟，超时的页不拖死全文——文档标记为新的 `partial` 状态，已识别内容照常入向量库可检索，UI 给琥珀色「部分 OCR」徽标。

真机实测（本地 Ollama qwen2.5vl:7b）挖出两个单测和静态分析都不可能发现的 bug，值得单独点出：

**坑一：pdfjs 会 transfer（detach）你的输入缓冲。** pdfjs 在 Node fake-worker 模式下通过 `structuredClone(obj, { transfer: [data.buffer] })` 传递数据，第一次 `getDocument` 之后输入 ArrayBuffer 的 `byteLength` 直接变 0。我们原来每页渲染都重新 `getDocument(data)`，于是从第二页起全部 `DataCloneError`——视觉和 tesseract 两条路都没真正跑起来过。修复：所有 getDocument 调用传 `data.slice()` 副本，runner 改成**整份 PDF 只打开一次、批量渲染全部目标页**，再逐页识别。

**坑二：视觉图撞本地模型 4096 上下文。** qwen2.5-vl 按像素桶算 image token（约 784 像素/token）。A4@2x = 870 万像素 → 4106 image token，直接 400。修复是加像素预算：`OCR_VISION_MAX_PIXELS = 200 万`，`resolveRenderScale` 在渲染前按 `sqrt(预算/基准像素)` 等比缩回，A4@2x 基本不受影响，超大画幅页自动降档。另外 OCR 调用固定 `temperature: 0`——真机对比发现默认采样温度会让模型随机性地漏行，转录任务本该是确定性的。

这两个坑的共同教训：**涉及原生模块和本地模型的链路，mock 全绿不等于能用，必须留真机端到端验证的时间**。修复后真实扫描件 8 秒识别双页、文本完整入库。

---

## M5 命令面板：契约放 shared，快捷键分两端

契约 [command.ts](file:///e:/code/traeWork/workBuddyForMe/packages/shared/src/command.ts) 放在 shared 而不是 web：`Command`（id/标题/分组/图标/执行回调描述）、`CommandGroup`（navigation/conversation/assistant/settings/update）、`fuzzyMatch`/`filterCommands` 纯函数。模糊匹配是 subsequence 匹配而不是 `includes`——敲「xh」能匹配「**新**建对**话**」，这是命令面板的标配手感。

唤起分两条路：Web 端全局 keydown 监听 Ctrl+K 自己开关；Electron 端额外注册 `globalShortcut`，窗口失焦也能唤起，通过 preload 暴露的 `commandPalette.onOpen` 桥通知渲染进程。面板本体是 Radix Dialog，方向键导航、回车执行、ESC 关闭。

---

## 数据：交付规模与门禁

| 指标 | 数值 |
|---|---|
| 提交 | 22 个（M1×5、M2×3、M3×4、M4×6、M5×3、版本/杂项×1，含真机修复批） |
| 改动 | 83 个文件，+6016 / -44 行 |
| 数据库迁移 | v4：documents 加 ocr_status / ocr_engine（纯 ADD COLUMN，老数据 NULL） |
| 新增运行时依赖 | tesseract.js（可选）、@napi-rs/canvas、electron-updater |
| 单元测试 | 414 个全绿（shared 16 / database 29 / ai 38 / core 186 / web 96 / desktop 35 / config 14） |
| 集成测试 | 12 个；Web E2E 7/7；Desktop E2E 4/4 |
| 打包验证 | web standalone 构建 exit 0，canvas/tesseract 原生件完成归集 |

---

## P2 留白与 Non-Goals

- **备份加密/增量**：单用户威胁模型下物理安全即足够；全量备份简单可靠，差量链的复杂度不值得
- **在线分享链接 / 分享为 PDF / 多会话批量分享**：导出文件即终点
- **自动更新灰度与 delta 包**：小体量应用全量替换可接受
- **OCR 置信度标注与人工校正 UI、多语言扩展**：中英文（chi_sim+eng）足够，其余语言包可手动放入 cache
- **命令面板插件体系**：内置命令够用，第三方扩展留给生态成熟后

---

## 后续篇目预告

- **B02**：备份归档格式设计——为什么选 tar.gz 不选 zip，四轨 JSON 的边界与 manifest 版本探测
- **B03**：合并式恢复的事务边界：幂等跳过、FK 安全、向量重建标记
- **B04**：对话分享的脱敏纯函数：四种密钥形态的正则与「默认外发」威胁模型
- **B05**：单文件 HTML 导出：内联 CSS、data URL 图片与水印
- **B06**：electron-updater 接入实录：状态机、IPC 桥与开发态 no-op 门控
- **B07**：pdfjs detach 血案：structuredClone transfer 如何吃掉你的 ArrayBuffer
- **B08**：本地视觉模型的像素预算：image token 桶、4096 上下文与 temperature 0
- **B09**：双引擎 OCR 编排：视觉优先、tesseract 兜底、partial 语义与超时层次
- **B10**：v0.4 复盘——一个人的项目怎么给数据设计「出口」

---

## 一句话总结

v0.1 让助手能聊，v0.2 让助手能动手，v0.3 让助手什么都能读，v0.4 让你的数据**不再被应用囚禁**：能备份带走、能脱敏分享、应用能自我更新，扫描件也终于读得进来。本地优先不等于数据孤岛——这是 v0.4 想证明的事。
