# WorkBuddy For Me 独立代码审查报告

> 审查日期：2026-09-19 ｜ 审查方式：只读抽查（依赖方向 / 300 行门禁 / 安全基线 / 核心正确性 / 测试真实性 / 文档一致性）
> 对照：spec.md（AC-1~12）、tasks.md（Task 1-39）、docs/architecture.md v1.0.0

## 一、总体结论

**有条件通过。**

架构符合度高：依赖方向无环、页面仅装配、300 行门禁实测全过、密钥全链路脱敏、测试外部调用 100% mock。核心逻辑（SSE 解析、重试、abort 语义）实现正确。阻断项为零；1 个 Major 为 docs/api.md 与实现的错误契约不一致（3 处），修复成本极低，修正后即可视为完全通过。其余为 Minor/Nit，不阻塞交付。

## 二、问题清单

### Critical

无。

### Major

- **M-1｜docs/api.md 与实现的错误契约不一致（内置助手删除状态码）**
  - `docs/api.md:43`（错误码矩阵 CONFLICT 示例）、`docs/api.md:65`（路由总览「内置助手 409」）、`docs/api.md:251`（「内置助手 → 409 CONFLICT」）三处均记载删除内置助手返回 **409**。
  - 实际实现为 **403 FORBIDDEN**：`packages/core/src/services/assistant-service.ts:76`（`throw new ApiError('FORBIDDEN', '内置助手不可删除')`）；且 `docs/architecture.md` §6 与 tasks.md Task 20/39 均记 403，api.md 与定稿架构文档自相矛盾。
  - 建议：将 api.md 三处 409 改为 403 FORBIDDEN，CONFLICT 示例保留「同名同内容文档重复上传」。

### Minor

- **m-1｜对话历史包含空 assistant 占位消息并发给上游**
  - `packages/core/src/chat/chat-orchestrator.ts:32-37` 先落 status=streaming、content='' 的助手占位消息，`:60` 再取 `recentMessages`（`packages/database/src/repositories/message-repo.ts:58-69` 的 `lastN` 仅过滤 `status='error'`），导致 `buildChatMessages` 末尾多出一条 `assistant`、`content=''` 的消息发送给供应商。多数 OpenAI 兼容后端容忍，但严格后端可能 400，且浪费上下文窗口。建议 `lastN` 或 `buildChatMessages` 过滤空 streaming 占位（按 id 排除当前 assistantMessage）。
- **m-2｜RAG 检索阶段中断被记为 error 而非 stopped**
  - `packages/core/src/chat/chat-orchestrator.ts:45-58`：`input.retrieve` 抛出的 AbortError 不匹配 ApiError/ProviderError，`normalizeFailure` 归为 `INTERNAL_ERROR`，消息落 error 并下发 error 事件；与流式阶段中断（`:81-84` 落 stopped + done）语义不一致。建议在该分支先判 `input.signal?.aborted` 走 stopped 路径。
- **m-3｜摄入流水线丢弃上游嵌入错误详情**
  - `packages/core/src/ingestion/ingestion-pipeline.ts:67-72`：仅 `error instanceof ApiError` 保留 message；适配器实际抛出的 `ProviderError`（含超时/上游状态详情）被替换为笼统的「向量嵌入调用失败」，与 chat 侧 `normalizeFailure`（`chat-orchestrator.ts:12` 处理 ProviderError）不一致，削弱 FR-19 的失败原因可读性。建议补 ProviderError 分支。
- **m-4｜摄入向量化写库非单一事务，且无卡死恢复**
  - `packages/core/src/ingestion/ingestion-pipeline.ts:74-89`：`deleteVectorsByDocument → chunks.deleteByDocument → bulkInsert → insertChunkVectors` 为 4 次独立写（各自事务，见 `packages/database/src/vector.ts:76-81`），进程中途崩溃可能留下「有 chunks 无向量」且文档停留 status=processing（无启动恢复扫描）。100 篇量级 + 幂等重摄可自愈，故仅 Minor。建议将四步包进一个 `db.transaction`。
- **m-5｜SSE 桥接未保护已取消的 controller**
  - `apps/web/src/lib/server/sse-stream.ts:16-27`：客户端断开后 `controller.enqueue`（catch 分支）与 `controller.close()`（finally）在已取消流上会抛 TypeError，形成 unhandled rejection（功能不受影响，服务端日志噪音）。建议 try/catch 包裹两处调用或判 `desiredSize`。
- **m-6｜api.md「apiKey 传空串被 422 拒绝」与实现不符**
  - `docs/api.md:150` 称 PATCH 供应商「传空串被 422 拒绝」；实际 `packages/shared/src/schemas/provider.ts:13,32` 允许空串（`trim().max(300)` 无 min），`packages/core/src/services/provider-service.ts:59-61` 对空串静默忽略（保留原 Key），无 422。建议文档改为「空串视为不修改」。
- **m-7｜api.md SSE 事件顺序图自相矛盾**
  - `docs/api.md:83` 写 `meta → delta* → citations? → done | error`，与实现（`chat-orchestrator.ts:50` citations 在首个 delta 之前）及同节 `docs/api.md:90`（「在 delta 之前」）矛盾。建议顺序图改为 `meta → citations? → delta* → done | error`。

### Nit

- **n-1｜短密钥脱敏可能完全泄露**：`packages/core/src/secrets/cipher.ts:47-52`，密钥 ≤7 字符时 head3+tail4 覆盖重叠（如 `abcde` → `abc****bcde`）。API Key 实际较长，风险极低；可对长度 ≤8 直接返回固定掩码。
- **n-2｜API 出参含未文档化字段**：`packages/core/src/services/provider-service.ts:11-13` 的 `toView` 展开 `ProviderRecord`，实际响应多返回 `hasApiKey: boolean`（`packages/database/src/repositories/mappers.ts:19-21`），api.md §4.3 的 Provider 接口未列。无安全影响，建议补文档或剔除。
- **n-3｜未使用的工作区依赖**：`packages/ai/package.json` 声明 `@wbfm/config`、`packages/config/package.json` 声明 `@wbfm/shared`，但两者 src 均无对应 import（全库 grep 证实），建议清理以免误导依赖图。
- **n-4｜令牌经窗口命令行传递**：`apps/desktop/src/main/window.ts:21-24` 将 `--wbfm-token` 放入 additionalArguments，本机其他进程可从进程命令行读到令牌。单用户本机场景可接受（ADR-0006 威胁模型内），记录备查。

### 未发现问题的维度

- **依赖方向**：未发现问题。五个包依赖单向无环（shared←config←database←core←ai 交叉核对 package.json 与 src import）；apps/web 页面/features/components 仅 import `@wbfm/shared`；`@wbfm/database`/`@wbfm/ai` 仅出现在 `apps/web/src/lib/server/*`（container 装配、api-response 错误映射）与测试文件，符合「页面不直连」约束。web→ai（ProviderError 类型）为架构图未画的辅助边，仅类型引用，可接受。
- **300 行门禁**：未发现问题。实测全库 222 个手写 .ts/.tsx 物理行数全部 ≤300（最大 268：`apps/web/src/features/assistants/assistant-form-dialog.tsx`）；`scripts/.lines-whitelist.json` 不存在（白名单零使用）；脚本 `--self-test` 覆盖 301 检出/300 边界/白名单放行。
- **安全基线（除 n-1/n-2/n-4 外）**：未发现问题。`token-guard.ts:6-13` 仅 WBFM_SERVER_MANAGED=1 时强制校验且未配令牌时 fail-closed（全拒）；全库非测试代码无 `apiKey` 明文出参（前端仅展示 `apiKeyMasked`，`provider-card.tsx:73`）；`window.ts:32-40` contextIsolation:true / nodeIntegration:false / sandbox:true / webSecurity:true；`fetch-with-retry.ts` 4xx 不重试、SSE 通道独立不重试（避免重复计费）。
- **ai 包 SSE 解析与重试**：未发现问题。`sse-parser.ts` 正确处理半包拼接、多行 data、CRLF、注释行、尾部残留块；`fetch-with-retry.ts` 超时/5xx/连接错误指数退避、重试耗尽归一化、外部取消透传不重试；`chat-stream.ts:33-37` finally 中 cancel 上游 body + dispose 解绑，abort 无悬挂连接。
- **测试真实性**：未发现问题。25 处 `vi.stubGlobal('fetch', …)` 覆盖 ai/core/web 全部外部调用点，测试文件无任何真实 `fetch('https://…')`；E2E 经 `WBFM_MOCK_AI=1` 注入进程内 mock provider（`packages/core/src/services/provider-adapter.ts:12-14`），桌面冒烟走生产链路但模型调用仍为 mock。

## 三、AC-11 rubric 独立评分（阈值 ≥4）

| 维度 | 评分 | 依据 |
|---|---|---|
| 模块边界清晰度 | 5 | 页面零业务逻辑，逻辑全部下沉 packages/core 服务与纯函数；container 单点装配（`apps/web/src/lib/server/container.ts`）；跨包依赖经逐一 grep 核实单向无环；无一处页面/feature 直连 database/ai。 |
| 组件拆分合理性 | 4 | 全部文件 ≤300 行（最大 268），chat 页拆为 Sidebar/Switcher/MessageList/MessageItem/Composer + use-chat-session hook，职责单一；扣分点：`assistant-form-dialog.tsx`（268 行）仍集中表单构建、校验、提交与删除确认，可再抽 form schema。 |
| 命名一致性 | 5 | 统一规律可循：`createXxxService/createXxxRepository/buildXxx` 工厂、`-repo.ts`/`-service.ts` 后缀、SSE 事件名与 `shared` 常量同源、错误码单一事实源（`shared/errors/error-codes.ts`）且 api.md/architecture 引用同表。 |
| 纯函数可测性 | 5 | 关键逻辑均为可独立单测的纯函数或注入式工厂：`chunkText`、`buildChatMessages`、`maskSecret`、`buildWindowOptions`、`parseSse`、`normalizeVector`；实测覆盖率 config 96.2% / database 95.2% / ai 93.0% / core 85.0%（阈值 70%）。 |
| **综合** | **4.75 / 5** | 达标（≥4），与 Task 39 自评 4/5 方向一致，本审查略高。 |

## 四、与 tasks.md Task 39 验收记录的交叉核对差异

1. **AC-10（文档一致性）**：Task 37/39 记录 api.md「与路由逐项对照无遗漏、一致」——路由覆盖（19 条）与方法/路径/包络核对**属实**，但存在 M-1（内置助手 409 vs 实际 403）、m-6（空串 422 vs 静默忽略）、m-7（SSE 顺序图）三处字段/语义错误，Task 39 的「✅ 完全一致」结论偏乐观。**此为本审查与验收记录的主要差异点。**
2. **AC-11 自评 4/5**：本审查评 4.75/5（见上表），无实质分歧，验收记录保守成立。
3. **AC-6 中断语义**：Task 34 已披露并修复 stop() 后前端 streaming 状态残留；本审查补充发现的 m-2（RAG 阶段中断落 error）为验收未覆盖的同族边界，属新增发现而非记录错误。
4. 其余 AC-1/2/3/4/5/7/8/9/12 记录与代码证据交叉核对**一致**，无差异（AC-2 行数、AC-9 mock 策略、AC-12 安全断言均已独立复核）。

## 五、结论

按问题严重度：Critical 0、Major 1、Minor 7、Nit 4。M-1 为交付前应修正的文档契约错误（仅改 api.md 三处，无代码改动）；m-1~m-7 建议纳入下个迭代；Nit 可选。修正 M-1 后本项目达到「通过」标准。

## 六、修复闭环记录（2026-09-19）

- **M-1 ✅ 已修**：api.md 错误码矩阵/路由总览/4.16 节三处 409 → 403 FORBIDDEN，FORBIDDEN 语义行同步修正（原「预留」改「禁止操作（如删除内置助手）」）。
- **m-1 ✅ 已修**：chat-orchestrator.ts 组装上游消息前过滤本轮流式占位（`filter((m) => m.id !== assistantMessage.id)`），空 assistant 消息不再发给供应商。
- **m-2 ✅ 已修**：chat-orchestrator.ts RAG 阶段 catch 先判 `input.signal?.aborted`，与流式阶段一致落 stopped 并下发 done。
- **m-3 ✅ 已修**：ingestion-pipeline.ts 嵌入失败保留 `ProviderError.message` 上游详情（与 ApiError 同等对待）。
- **m-5 ✅ 已修**：sse-stream.ts enqueue/close 包 try/catch，客户端断开后不再产生 unhandled rejection。
- **m-6 ✅ 已修**：api.md 4.5 节改为「apiKey 缺省或传空串均视为不修改」。
- **m-7 ✅ 已修**：api.md §3 事件顺序图改为 `meta → citations? → delta* → done | error`。
- **m-4 ⏸ 留待下迭代**：摄入四步写库合并单事务（现状幂等重摄可自愈，改动涉及 database 层事务 API，风险收益比不划算）。
- **n-1~n-4 ⏸ 可选不修**：短密钥掩码、hasApiKey 出参文档化、未使用工作区依赖、命令行传令牌——均在本机单用户威胁模型内，已记录备查。

**修复后验证**（全 0 退出）：`pnpm check`（typecheck 12/12 + lint 6/6 + 行数门禁）、`pnpm test:unit` 12/12 turbo 任务、`pnpm test:integration` 7/7、`pnpm test:e2e` 5/5。M-1 与全部低成本 Minor 闭环后，本审查结论升级为**通过**。
