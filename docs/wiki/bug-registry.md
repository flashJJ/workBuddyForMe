# Bug 记录表

> 归档范围：v4.16 CI 稳定性专项期间的「CI 故障 + 深度排查缺陷」。
> 每条记录包含现象、根因、修复与回归方式；提交号对应 `main` 分支。
> 配套：[验收清单（失败路径与边界场景）](./acceptance-checklist.md) —— 同类问题的常规回归门禁。
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
| B-29 | P0 | 工具评测 | promptfoo 3/3 通过后步骤仍挂到 15 分钟超时 | POSIX 上只 SIGTERM shell，pnpm/next 孙进程残留并占住管道；脚本只设 `exitCode` 不退出 | 子进程 `detached` + 进程组 SIGTERM/SIGKILL，结尾显式 `process.exit` | 本地 `tool-eval` 3/3、退出码 0、端口无残留 | 本批 |
| B-30 | P3 | Eval 包装器 | `with-server` 在 POSIX 同样只杀 shell，next 孙进程变孤儿占端口 | 同 B-29 的进程树回收缺失 | 整组 kill + 显式退出 | 其他 eval 步骤既有通过记录 | 本批 |
| B-47 | P2 | E2E | 免手 VAD ③ 失败后组内重试从 ① 开始，同名供应商叠加，标题断言命中 2/3 个元素，重试必失败 | ① 依赖全新数据根，未做幂等清理（同 B-04 类） | ① 创建前按名称清理残留供应商，组结束 `afterAll` 再清一次 | 重试可从 ① 干净重跑 | 本批 |
| B-48 | P0 | E2E | 41 个 spec 共用一个数据根，跨文件残留造成顺序依赖与「重试必败」（B-03/04/47 同一病根），只能逐条打清理补丁 | 缺文件级隔离；E2E 串行执行让污染被字母序掩盖 | 新增仅 mock 模式挂载的 `POST /api/testing/reset`（停常驻定时器/丢弃语音运行时与编译队列单例→关库→清数据根→重建容器）；41 个 spec 统一 `beforeAll` 重置；原跨套件依赖改为 `tests/e2e/seed.ts` 自行播种 | 生产构建全量 150 例：147 通过 / 3 跳过 / 0 失败（19.1 分钟） | 本批 |
| B-49 | P1 | 服务端容器 | 容器重建后旧路由 chunk 仍持旧实例，旧 SQLite 连接不释放（Windows 删数据根 EPERM），/api/voice/* 命中已关闭连接 | `container.ts` 模块级单例在 Next 多 chunk 打包下各自漂移；VoiceRuntime 等 globalThis 单例同样绑旧库 | 单例只保留 `globalThis` 一份；重置前停调度器/流程补偿定时器、丢弃 VoiceRuntime 单例并关闭容器 DB | reset 连续调用均 200，数据根可清理，语音路由正常 | 本批 |
| B-53 | P1 | Nightly | 夜间验收在干净检出上构建 Web 必失败：`Can't resolve '@wbfm/shared/pet'`（另有 `@wbfm/shared/constants`） | 工作区包子路径 exports 的生产条件指向 gitignore 的 `dist/`；夜间直接 `build:web`，未先构建依赖。CI 因先跑 `typecheck`（turbo `^build`）顺带产出 dist 而幸免 | 根 `build:web` 改为 `turbo run build --filter=@wbfm/web`，由 `dependsOn: ["^build"]` 自动构建工作区依赖 | 清空 `packages/*/dist` 后 `pnpm build:web` 成功；`check:exports` 6/6；手动重跑夜间 `44851702148` 全绿 | `22f1711e` |
| B-54 | P2 | Nightly | 视觉巡检每晚以 `EADDRINUSE 127.0.0.1:43102` 启动失败（非阻断但恒红），基线比对实际从未在 CI 生效 | 测试类固定端口取 42339–42342 / 43101–43104，全部落在 Linux 临时端口段（32768–60999）；前序步骤的出站连接随机占用该端口后，显式 bind 即失败 | 测试端口整体下移到 32xxx（E2E 32339、验收 32341、工具评测 32342、eval 32340、夹具 32101–32104），并在 `development.md` 固化约定 | `grep` 全仓无残留旧端口；`pnpm check` 全绿；下一次夜间运行视觉步骤可正常启动 | 本次 |

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
| B-50 | P2 | 任务事件流 | 展开已结束的任务时，每隔约 3 秒重连一次 `/api/tasks/:id/events`，服务端反复回放全部步骤 | `useTaskEvents` 收到 `run_finished` 后未关闭 `EventSource`；服务端正常关流触发浏览器自动重连 | 终态帧到达即 `es.close()` 并置状态 closed | `use-tasks.test.tsx` 2 条 | 本批 |
| B-51 | P3 | 会议 / 舞台 | 会议 SSE 进行中切换页面或关窗，控制台出现 `AbortError` 未处理拒绝（dev 态弹错误覆盖层） | 流式段异步 IIFE 没有 try/catch，卸载 abort 的拒绝无人接收 | 流式段收敛异常并加 `stopped` 守卫，卸载后不再写状态 | `meeting-sse-unmount.test.tsx` 2 条（MSW 挂起请求） | 本批 |
| B-52 | P3 | SSE 服务端 | 观察者断开后服务端仍持续消费事件生成器；总线迭代器 `return()` 也无法唤醒挂起的 `next()` | `sseResponse` 无 `cancel()` 且吞掉 enqueue 异常；`makeIterator.return()` 清空 resolver 但不唤醒 | `cancel()` 置位并在 enqueue 失败即停；`return()` 置 stopped 并唤醒等待者 | `sse-stream.test.ts` + `run-event-bus.test.ts` | 本批 |
| B-55 | P3 | 工作流运行 | 长会话里每次把流程当工具调用一次，进程内就跑一次 override 内存累积（B-25 只修了队列路径） | `runOverrides` 在 createRun 时对所有触发器写入，但 chat 运行由 `invokeFromChat` 直接执行，不经过队列的 `finally` | `createChatInvoker` 增加 `releaseRun` 钩子，在 finally 回收 override；抛错路径同样回收 | `chat-invoke.test.ts` 覆盖成功/抛错两条路径 | 本批 |
| B-56 | P2 | MCP | MCP 服务器「禁用 → 再启用」后永久停在 disconnected，必须改配置或重启应用才恢复 | `reconcileAll` 禁用分支只断开连接、不删 registry 条目；`configSignature` 刻意忽略 `enabled`，重新启用时命中「签名相同」分支直接跳过 | 禁用时 `entries.delete(server.id)`，重新启用按全新条目连接 | `registry.test.ts` 新增「禁用后再启用会重新连接」（修复前稳定失败） | 本批 |
| B-57 | P1 | 打包 | 干净检出上 `pnpm dist:win` 打包必失败（`Can't resolve '@wbfm/shared/...'`），与 B-53 同源 | 桌面 `dist:win`/`pack:dir` 仍用 `pnpm --filter @wbfm/web build`，不触发 turbo 的 `^build`，工作区包 dist 缺失 | 两条脚本改为 `pnpm -w run build:web`，复用 turbo 依赖构建 | 干净 `packages/*/dist` 下执行 `pnpm dist:win` 成功出包 | 本批 |
| B-58 | P2 | 测试稳定性 | 并行跑 `pnpm test:unit` 时 `repo-invariants` 偶发 20s 超时（单跑 182ms） | 扫描根包含 `apps/desktop/resources/server`——prepare-server 归集的 standalone 带了 1418 个 `apps/web/src` 副本，并行构建期磁盘争用放大耗时 | 不变量扫描忽略 `resources`（构建产物不是源码） | `pnpm test:unit` 全量通过；单测扫描恢复毫秒级 | 本批 |

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
| B-22 | P2 | MCP 进程 | MCP 子进程退出瞬间写 stdin 可能拖垮宿主；Windows 禁用/重载后 npx 下真实服务残留 | `child.stdin` 无 `error` 监听（EPIPE 属未处理事件）；`kill()` 只杀直接子进程 | stdin/stdout/stderr 补 error 监听；Windows 改 `taskkill /T /F` 整树终止 | `stdio-transport` + 真实子进程集成测试 | 本批 |

## 四、生命周期（分支 / 子代理 / 工作流）

| ID | 级别 | 领域 | 现象 | 根因 | 修复 | 回归 | 提交 |
|---|---|---|---|---|---|---|---|
| B-23 | P2 | 会话分支 | 终态落账异常时产生未处理拒绝，且分支永久停在 running，持续占用并发名额与预留 token | `.then(finalize)` 无 catch，`void promise.finally` 放大拒绝 | `markBranchRunFailure` 兜底收敛 failed 并释放预留 | `branch-service` 新增用例 | 本批 |
| B-24 | P2 | 外部代理 | 审批/审计/证据写入抛错时运行永久停在 queued/running，`void execute` 变成未处理拒绝 | `start()` 未 catch 执行链 | `finalizeInternalFailure` 收敛 failed 并释放 pending | `subagent-run-service` 新增用例 | 本批 |
| B-25 | P2 | 工作流运行 | 认领后编译或执行体异常 → run 永久 running（只能重启恢复），运行 override 泄漏 | `loadCompiledGraph` 在 try 外，异常只被队列记录日志 | 全流程 try/catch 落 `run_failed` + `finishRun`，finally 清 override | `run-service` 既有用例 | 本批 |
| B-26 | P1 | MCP 工具 | 工具名含 `.` 等服务端调用报 unknown tool：净化后的名字被当成真实名发出 | `listTools` 只保留安全名，`callTool` 直接回传安全名 | 安全名→原始名映射，调用时还原；同名净化冲突追加后缀 | `mcp/client.test` 新增用例 | 本批 |
| B-27 | P3 | MCP 工具 | 不规范服务器重复返回同一 `nextCursor` 时无限翻页 | 分页循环只判空、不判重复 | 记录已见游标，重复即终止 | `mcp/client.test` 新增用例 | 本批 |
| B-28 | P2 | MCP 连接 | 修改配置重连时，旧进程迟到的 close 会清掉新 client 并误标 error | `onClose` 无条件清 entry，无连接代际判断 | 按 client 身份守卫 close/工具刷新；连接逻辑抽到 `registry-connection` | MCP 17 条测试 | 本批 |

## 五、工具运行时与权限边界

| ID | 级别 | 领域 | 现象 | 根因 | 修复 | 回归 | 提交 |
|---|---|---|---|---|---|---|---|
| B-31 | P1 | MCP 权限 | 外部 MCP 工具一律按 read 放行：`confirm_each` 下写操作不弹审批，`plan_only` 下也照常执行 | `createMcpTool` 硬编码 `permission:'read'`，`tools/list` 的 annotations 从未采集 | 按 `readOnlyHint`/`destructiveHint` 推导 read/write/danger，未声明按 write 保守处理；描述符同步 | `mcp/client.test` 权限用例 + `descriptor` 用例 | 本批 |
| B-32 | P2 | MCP HTTP | HTTP 传输下工具名含 `.` 等字符时调用报 unknown tool；净化重名未消歧；重复 cursor 可无限翻页 | 仅 stdio 客户端做了安全名→原始名映射与游标去重，HTTP 传输未同步 | 复用 `uniqueToolName` + raw 名映射，游标去重与 stdio 对齐 | `http-transport.test` 新增用例 | 本批 |
| B-33 | P3 | 工具审批 | 模型给 `capability_install` 传 `"null"` 参数时整轮对话中断 | `confirmationDetailsOf` 直接对 `JSON.parse('null')` 结果取属性 | 非对象参数直接返回 undefined，审批详情降级为空 | `chat/tools/__tests__/confirmation-details.test.ts` | 本批 |

## 六、备份与导入边界

| ID | 级别 | 领域 | 现象 | 根因 | 修复 | 回归 | 提交 |
|---|---|---|---|---|---|---|---|
| B-34 | P1 | 备份恢复 | 导入恶意/损坏备份可把文件写到数据根之外（如 `attachments/../../x`）；超大 gzip 条目可撑爆内存 | 恢复端不校验 tar 条目名，附件与技能落盘直接 `path.join`；解压无体积上限，导出侧 500MB 限制未覆盖恢复 | 条目名拒绝穿越/绝对路径/反斜杠/控制字符；单条 32MB、整包 1GB、10 万条目上限；技能名校验后落盘 | `backup/__tests__/archive-safety.test.ts` 5 条 | 本批 |
| B-35 | P2 | 检索 / 记忆 | 切换嵌入模型（维度变化）后，绑定知识库的对话直接报「查询向量维度不一致」；记忆召回与新建/编辑同样抛错 | 向量表维度固定；检索与记忆路径遇到维度不一致直接抛异常，缺少「脏索引降级」分支 | 混合检索跳过向量通道只走 FTS，纯向量路径返回空；记忆召回/写入在维度不一致时降级为关键词且照常落库 | `retrieval.test` + `memory-service.test` 新增用例 | 本批 |
| B-36 | P2 | 事件引擎 | `sink.release` 或用量记账抛错时，演出终态永不落定，director 永久 busy，后续所有剧本卡死 | `EventRunner.run()` 的 finally 与 `onSettled` 未隔离异常，靠 Promise 链向上传递 | 两处捕获并告警，终态落定与队列补位照常执行 | `runner.test` / `director-gates.test` 新增用例 | 本批 |
| B-37 | P2 | 内容包导入 | 恶意 `.wbfm-pack` 声明高压缩比条目时，预检在逐条大小校验前先整包解压，可耗尽内存 | 只有解压后的单条目大小校验，缺少中央目录层面的总体积上限 | 解压前按 `uncompressedSize` 求和，超过 4×包上限（80MB）直接判 `tooLarge` | `pack-inspect.test` 压缩炸弹用例 | 本批 |

## 七、服务端常驻与内存回收

| ID | 级别 | 领域 | 现象 | 根因 | 修复 | 回归 | 提交 |
|---|---|---|---|---|---|---|---|
| B-38 | P2 | 服务端调度 | 调度依赖（关系检查点/到期扫描）抛错时，10s tick 变成未处理拒绝，Node 直接退出，桌面端显示服务已停止 | `void runServerSchedulerTick().finally()` 没有 catch，拒绝沿 Promise 链逃逸 | 补 `.catch` 告警；单次失败不阻断下个周期 | `server-scheduler.test` 新增用例 | 本批 |
| B-39 | P3 | 工作流事件 | 每次运行结束仍把完整事件数组留在进程内，长会话内存随运行次数增长 | `FlowEventBus.dispose` 只有测试调用，队列与对话触发路径都不回收 | 两条执行路径终态后 `dispose(runId)`；迟到观察者走落库回放 | `run-service.test` + `chat-invoke.test` 新增用例 | 本批 |
| B-40 | P3 | 会议 | 已结束/跨进程会议打开 SSE 时新建永不关闭的总线：连接悬挂不结束，buses 随会议数泄漏 | `observe()` 未按契约判断 active；`finish/abort` 只 close 不 delete | 非 active 返回 null；结束后 close + delete，交给落库回放 | `meeting-service.test` 新增用例 | 本批 |
| B-41 | P2 | 文档解析 | 上传 10MB 内的恶意 docx/xlsx/pptx 可解压出数 GB（压缩炸弹），解析时撑爆服务进程 | OOXML 解析直接在原始 buffer 上解包，没有解压后体积上限；pptx 直接 `unzipSync` 整包 | 解析前扫描 ZIP 中央目录，解压后总体积超 256MB 即拒绝；zip64 哨兵一律拒绝 | `office-parsers.test` 压缩炸弹用例 | 本批 |

## 八、资源边界（语音 / OCR / 解压体积）

| ID | 级别 | 领域 | 现象 | 根因 | 修复 | 回归 | 提交 |
|---|---|---|---|---|---|---|---|
| B-42 | P2 | 语音引擎 | 启动预热与首句朗读同时发生时加载出两个 TTS worker，被覆盖的那个连同模型内存常驻到进程结束 | `ensureTts` 无并发去重：两路同时看到「无引擎」各自创建，后完成者覆盖前者 | 进行中的创建共享 `ttsPending` Promise，落定后清理；创建期间配置切换则按最新设置重建 | `voice-runtime.test` 并发首句 / 预热并发 2 条 | 本批 |
| B-43 | P3 | 语音 worker | worker 加载超过 30s 就绪超时后线程不终止；每次重试再建一个，内存持续增长 | `WorkerTtsEngine.create` 只在就绪成功后接管 worker，`waitReady` 失败路径没有 `terminate` | 就绪失败即终止 worker 并原样抛错 | `tts-worker.test` 假 worker + 假定时器用例 | 本批 |
| B-44 | P2 | 文档 OCR | 无视觉模型时上传超大画幅（异常 MediaBox）的扫描 PDF，tesseract 渲染单页位图可达数 GB，服务进程 OOM | 视觉路径有 200 万像素预算，tesseract 路径渲染未传 `maxPixels`，且批量预渲染后整批 PNG 常驻 | 新增 `OCR_TESSERACT_MAX_PIXELS`（1600 万像素）等比缩回；标准 A4@3x（≈450 万像素）不受影响 | `ocr-runner.test` tesseract 渲染参数断言 | 本批 |
| B-45 | P2 | 能力包 | 上传 20MB 内的能力包 ZIP 可声明数百 MB～数 GB 解压体积，`unzipSync` 直接撑爆服务进程（安装与升级两个入口） | 能力包解析只做了路径/校验和/entry 大小校验，没有中央目录层面的解压总体积上限（与 B-37/B-41 同类） | `parseCapabilityZip` 解压前先按中央目录求和，超过 80MB 即拒绝；错误文案按「能力包」区分 | `capabilities/__tests__/capability-zip-bomb.test.ts` 2 条 | 本批 |
| B-46 | P2 | 文档解析 | B-41 修完后，docx/xlsx/pptx 仍可经「结构解析」路径触发压缩炸弹：`extractDocumentText` 先走 `parseDocumentStructure`，该路径直接调用解析器 | 预算校验只加在纯文本入口 `readDocumentText`，`readDocxHtml`/`readXlsx`/`readPptx` 自身不校验，结构解析路径绕过 | 预算下沉到三个 Office 解析器入口（含可选预算参数供测试注入），结构/纯文本两条路径共用同一闸门 | `office-parsers.test` 解析器入口炸弹用例 | 本批 |

## 排查方法

- **CI 侧**：从失败步骤日志与 Playwright 归档（`playwright-artifacts` 的 `error-context.md`）反推真实断言与页面快照。
- **代码侧**：按「异步竞态 / 资源泄漏 / 事务与级联 / 跨系统边界校验 / 屏幕与生命周期」五类逐目录通读；每个结论都必须能指出触发条件与后果。
- **回归侧**：修复必须附带可复现的单测或 E2E；环境相关的用例（如 CI 软件渲染）用显式复位与超时隔离，不依赖历史状态。
