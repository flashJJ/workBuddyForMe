# Bug 记录表

> 归档范围：v4.16 CI 稳定性专项期间的「CI 故障 + 深度排查缺陷」。
> 每条记录包含现象、根因、修复与回归方式；提交号对应 `main` 分支。
> 级别：P0 进程/数据风险 ｜ P1 功能不可用或必现失败 ｜ P2 体验/边界缺陷 ｜ P3 健壮性加固。

## 一、CI 与 E2E

| ID | 级别 | 领域 | 现象 | 根因 | 修复 | 回归 | 提交 |
|---|---|---|---|---|---|---|---|
| B-01 | P0 | 自动验收 | 日志已打印 `6/6 通过`，CI 步骤仍挂起约 3 小时 | `pnpm → next` 孙进程残留，脚本未显式退出 | spawn `detached` + POSIX 进程组 kill、结尾 `process.exit` | 本地 `node scripts/acceptance/run.mjs` 退出码 0、无残留监听 | `ccc7fdcf` |
| B-02 | P1 | CI | E2E 步骤 35 分钟被强杀，尾部用例未跑 | 140+ 用例串行 + serial 组整组重试 + 软件渲染重型用例 | 步骤 70 分钟、job 150 分钟，E2E 前移到验收之前 | CI 全量 E2E 19.2 分钟完成 | `9d089357` |
| B-03 | P1 | E2E | Live2D ⑤ 在 CI 必失败（60s 轮询超时） | 默认 `avatarModelId` 是内置 VRM，⑤ 挂载 VrmCanvas，永远等不到 Live2D 资源；本地因复用历史设置而不复现 | `beforeAll` 显式固定 `avatarModelId=haru` | CI Live2D ①–⑥ 通过 | `9d089357` |
| B-04 | P1 | E2E | Live2D ② 在 serial 重试中必失败（形象栏数量 1≠0） | ⑤ 失败后 ④ 写入的 `avatarEnabled=true` 残留，重试从组头开始 | 同一 `beforeAll` 复位 `avatarEnabled=false` | 重试幂等 | `9d089357` |
| B-05 | P2 | E2E | stage「场景保存/读取/删除」超过 120s 用例上限 | CI 软件渲染下 openStage 约 50s，多次下拉交互叠加 | 单用例 `setTimeout(210_000)` | CI 该用例通过 | `9d089357` |
| B-06 | P2 | E2E | Live2D ⑦ 断言选择器 5 项，实际 8 项 | v2.0 起选择器加入 3 套内置 VRM，用例未同步 | 只筛选 5 套 Live2D 角色再断言 | CI ⑦ 通过 | `13bcf58a` |

## 二、运行时缺陷

| ID | 级别 | 领域 | 现象 | 根因 | 修复 | 回归 | 提交 |
|---|---|---|---|---|---|---|---|
| B-07 | P1 | AI 流式 | 上游僵死时 UI 永久转圈，120s 空闲超时从不生效 | 看门狗调用 `response.body.cancel()`，而 body 已被 `parseSse` 的 reader 锁定 → `TypeError: ReadableStream is locked` 被吞 | 内部 `AbortController` + `AbortSignal.any` 中止 fetch | `chat-stream-idle` 真实 SSE 回归测试 | `13bcf58a` |
| B-08 | P1 | 桌面启动 | 托管服务健康检查失败后，已 fork 的 Next 进程成为孤儿 | 失败路径未调用 `stopChild`，`will-quit` 也不知道该子进程 | try/catch 内回收子进程后重抛 | `server-manager.test` 新增用例 | `9d089357` |
| B-09 | P2 | 语音播放 | 每次 barge-in/停止后播放泵永久悬挂，泄漏音源引用 | `cancelAll` 先置 `onended=null` 再 `stop()`，`play()` 的 Promise 永不 resolve | `pendingResolvers` 映射 + 显式 resolve | voice 单测 25 条 | `9d089357` |
| B-10 | P2 | 语音录制 | 权限弹窗未决时切走页面，麦克风轨道不释放（指示灯常亮） | `getUserMedia` await 后无取消守卫，在已卸载组件上建 AudioContext | 启动代际 token，取消/卸载即作废并归还轨道 | `use-voice-recorder` 单测 | `9d089357` |
| B-11 | P2 | 网页抓取 | GBK/GB2312 中文站点经 `fetch_webpage`/剪藏后整页乱码 | 响应体固定按 UTF-8 解码，无 charset 兜底 | 按 `content-type`/`<meta charset>` 解码，gb2312 归一到 gbk | `safe-web-fetch.test` 4 条 | `9d089357` |
| B-12 | P2 | 对话流 | 急停后立即再发时，旧流的收尾把新一轮 `streaming` 置为 false | `finish/cleanup` 未校验自己是否仍是当前 controller | 收尾前校验 controller 身份 | `use-chat-stream` 竞态用例 | `13bcf58a` |
| B-13 | P3 | 桌面启动 | 服务监听但不应答时，30s 健康检查 deadline 失效（最长可卡 5 分钟） | 单次 fetch 无超时 | 每轮 `AbortSignal.timeout(min(5s, 剩余))` | `wait-for-server` 单测 | `13bcf58a` |
| B-14 | P3 | 对话旁路 | 后台任务拒绝时可能产生 unhandledRejection | `void job.finally(...)` 未吞拒绝 | 登记时 `catch` 后再跟踪 | `background-jobs` 单测 | `13bcf58a` |

## 三、数据与桌面（深度排查批次）

| ID | 级别 | 领域 | 现象 | 根因 | 修复 | 回归 | 提交 |
|---|---|---|---|---|---|---|---|
| B-15 | P1 | 知识库 | 删除从未成功嵌入过的文档/知识库直接报错，删不掉 | `chunks_vec` 首次嵌入才懒建，`deleteVectorsByDocument` 无条件 DELETE → `no such table` | 无向量维度记录时直接返回 | `document-service` 用例复现并覆盖 | `3e063f17` |
| B-16 | P2 | 知识库 | 删除文档/知识库后 `chunks_fts` 残留，删除内容留在索引里并挤占召回名额 | `chunks_fts` 是普通 FTS 表，不随外键级联 | 文档删除事务内同步清 FTS；新增 `deleteByKnowledgeBase` | FTS 仓储 + document-service 用例 | `3e063f17` |
| B-17 | P1 | 桌面窗口 | 拔掉扩展屏/改分辨率后主窗启动在屏幕外，表现为「双击没反应」 | 持久化坐标未做可见性校验 | `ensureVisibleWindowState`（<80px 可见即视为离屏，丢坐标居中） | `window-state` 4 条单测 | `3e063f17` |
| B-18 | P2 | 舞台窗 | 窗口化退出后拔屏，舞台重开在屏幕外 | 同上，bounds 直接使用 | 复用 `ensureVisibleWindowState`，离屏回落主屏居中 | `stage-window` 单测 | `3e063f17` |
| B-19 | P2 | 自动更新 | 更新事件可能发往已销毁窗口；`updater:set-channel` 接受任意字符串写坏状态文件 | 缺 `isDestroyed` 守卫；IPC 边界未校验 | 发送前判销毁；`isUpdateChannel` 拦截非法值 | `updater` 17 条单测 | `3e063f17` |
| B-20 | P1 | 模型设置 | 删除模型/供应商后新对话报「对话模型不存在：<uuid>」 | 设置是 JSON 无外键，默认模型绑定不随删除清理 | `clearDefaultModelReferences` 清空三个默认模型键 | `model-reference-cleanup` 2 条 | `3e063f17` |
| B-21 | P2 | 语音下载 | 取消下载后卡片永久停在「下载中」，重启也无法重新下载 | AbortError 分支不落持久化状态，`status=downloading` 且无活动任务 | `markCancelled` 回 missing（保留字节续传）+ 前端防御映射 | `voice-model-repo` 单测 | `3e063f17` |

## 排查方法

- **CI 侧**：从失败步骤日志与 Playwright 归档（`playwright-artifacts` 的 `error-context.md`）反推真实断言与页面快照。
- **代码侧**：按「异步竞态 / 资源泄漏 / 事务与级联 / 跨系统边界校验 / 屏幕与生命周期」五类逐目录通读；每个结论都必须能指出触发条件与后果。
- **回归侧**：修复必须附带可复现的单测或 E2E；环境相关的用例（如 CI 软件渲染）用显式复位与超时隔离，不依赖历史状态。
