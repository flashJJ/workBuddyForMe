# Internal Hardening —— 代码优化与架构还债 · 方案总览（v1.1）

> 版本：v1.1（基线 tag 待 v1.0.0 真人验收后封版；分支拟用 `feature/v1.1-internal-hardening`）
> 日期：2026-10-08
> 主题：**零新功能的内部加固**——分层强制、工具结果压缩、热点文件拆分、契约防漂移、评估平台化
> 借鉴来源：elpis（NestJS + LangGraph AI 应用框架，`e:\code\elpis-main`），只取**与框架无关的工程资产**，不迁 NestJS DI
> 上一版方案：[v1.0 Voice Companion](../v1.0/README.md)

---

## 1. 一句话方案

v1.0 用六个里程碑把语音/形象/桌宠/主动搭话堆进了同一个 monorepo，功能闭环但留下一批「能跑、但边界靠人记着」的债。v1.1 不做任何用户可见功能，专门把这些债**用门禁和纯函数模块固化下来**：让包依赖方向有 ESLint 强制、喂给模型的工具结果有统一压缩层、超限热点文件拆回 300 行以内、SSE 契约单一派生、评估从「记忆一个域」扩成平台。

## 2. 为什么做：v1.0 收尾时暴露的五个信号

1. **边界只靠自觉**：全仓没有任何依赖方向强制（无 `eslint-plugin-import`/`no-restricted-paths`）。包之间暂时没乱（已核实零 `@wbfm/*/src` 深路径引用），但语音运行时策略（226 行引擎生命周期编排）已经写进了 `apps/web/lib/server` 而不是 `@wbfm/voice`/`@wbfm/core`——可复用领域逻辑困在可部署应用里。
2. **工具结果没有统一压缩层**：RAG 片段有中央 token 预算、历史有递归摘要，但工具回灌模型的 `output` 只有**各工具自限**（网页工具 8000 字、summary 120 字）；MCP/Flow/桌面控制类工具返回超大 JSON 时原样进 prompt，只靠上游 400 兜底。
3. **300 行门禁开始靠白名单维持**：pet-manager.ts 483 行、pet-manager.test.ts 366 行已登记白名单；另有 72 个文件 ≥200 行，其中 task-loop 299、desktop main/index.ts 296、run-service 285、chat-orchestrator 279 等热点贴线运行，下次加功能必爆。
4. **契约有重复列表现象**：`SsePayloadMap`（shared）已是唯一真源，但 core 的 `OrchestratorEvent` 把手写 8 个事件联合又列了一遍——v1.0 加 task/flow/voice 事件时这份列表没同步，靠桥接层各自绕过。
5. **质量门禁覆盖不均**：覆盖率阈值只有 core 包（statements/lines 70%）；e2e 的 typecheck 是 v1.0 收尾才补上的；评估脚本只有 `eval-memory` 一个域、断言逻辑内联在脚本里。

## 3. 目标与非目标

### 目标（全部可机械验证）

| 编号 | 目标 | 衡量方式 |
|---|---|---|
| G1 | 分层可执行化 | `no-restricted-paths` 规则上线，CI 0 违例；文档化 `internal/` 私有目录约定 |
| G2 | 语音运行时归位 | 引擎生命周期编排从 `apps/web` 下沉到包，web 侧仅留 HMR 单例与 HTTP 桥；standalone 打包行为不变 |
| G3 | 工具结果中央压缩 | 纯函数压缩模块 + 双视图（模型看压缩、trace/UI 看全文）；单测覆盖 ≥95%；100KB 工具输出回归用例 |
| G4 | 热点文件还债 | pet-manager 两文件拆出白名单；≥260 行热点清单逐个处置，白名单仅剩「自动生成文件」一类 |
| G5 | 契约零漂移 | `OrchestratorEvent` 由 `SsePayloadMap` 机械派生；一致性测试锁死事件集合 |
| G6 | 评估平台化 | 抽断言纯函数库；golden set 从 1 个域扩到 ≥3 个域（记忆/工具压缩/主动搭话） |
| G7 | 零行为回归 | 全量 typecheck/lint/单测/集成/e2e 绿；v1.0 真人验收清单复测通过 |

### 非目标（本版本明确不做）

- **任何用户可见新功能**：输入内容护栏（elpis guardrail）、多 Agent 委派（invoke_agent）、AEC/唤醒词、新 Live2D 角色——全部顺延 v1.2 候选池
- **不引入 DI 框架**（Nest/tsyringe 都不引入）：现有「工厂函数 + ServiceDeps + 组合根 container.ts」对 Next.js App Router 是正确形态，elpis 的 `@Module`/Symbol 令牌/`@Inject` 不迁移
- **不重写状态管理、不换框架、不做 React Server Components 大改**
- **原路线图 v1.1「正式发布打磨」（代码签名/安装器/a11y/i18n/帮助中心）顺延 v1.2**——见 [roadmap 索引](../../roadmap/README.md) 修订说明

## 4. 方案范围（六个里程碑）

| 阶段 | 主题 | 核心交付 | 预估 |
|---|---|---|---|
| M0 | SDD 试点与边界门禁 | 本套三件套即试点；`eslint-plugin-import` + `no-restricted-paths`（先 warn 后 error）、分层约定文档 | 1 天 |
| M1 | 工具结果压缩层 | `tool-result-compact` 纯函数（token 预算感知）、双视图接线、大输出回归 | 2 天 |
| M2 | 热点文件拆分 | pet-manager 四件套拆分去白名单；barrel/热点清单逐个处置 | 2-3 天 |
| M3 | 语音运行时归位 | 引擎编排下沉 core/voice 域，web 留薄壳；打包链验证 | 2 天 |
| M4 | 契约防漂移 | 事件联合机械派生 + 一致性测试；SSE 消费端泛型收敛 | 0.5 天 |
| M5 | 评估平台化与收尾 | 断言库、golden sets ≥3、覆盖率分级门禁、1.1.0 版本/文档/tag | 1.5 天 |

详见 [03-实施路线与风险.md](./03-实施路线与风险.md)。

## 5. 关键设计决策

- **借 elpis 的「工程资产」，不借它的「框架形态」**。可直接移植的是：① 纯函数工具结果压缩器与「模型视图/trace 视图分离」原则；② `interface`/`internal`/`reference`（参考实现）目录约定；③ spec→plan→tasks 的合同式 SDD 流程；④ 零依赖断言库式 eval。明确**不借**：Nest 模块/Symbol 注入令牌/全局 Pipe-Filter-Guard/`createRequire` 三层配置/glob 扫 dist 注册——这些要么 Next 无挂载点，要么 wbfm 已有等价物（`{success,data}` 信封、ApiError、with-api-handler、@wbfm/config、工厂注册表）。
- **门禁先 warn 一周再 error**：边界规则与覆盖率扩面先以 warn 落地，避免一次性红灯淹没真实问题；error 化作为 M5 收尾的显式任务。
- **纯函数先行、接线后做**：压缩器/断言库都是零依赖纯 TS 模块，先 TDD 落盘，再改调用点——把「重构风险」压缩成「换接线」。
- **搬家不改接口**：语音运行时下沉时，web 侧保留同签名 re-export 薄壳，路由与 singleton 零改动，风险只在打包归集（prepare-server.mjs）一处。
- **每个任务必须带可机械验证的完成标准**（学 elpis tasks.md），不接受「重构完了」这种关单理由。

## 6. 文档导航

| 文档 | 内容 |
|---|---|
| [01-现状与差距分析.md](./01-现状与差距分析.md) | elpis 架构取证、wbfm 量化盘点、借鉴/不借鉴对照表 |
| [02-重构设计.md](./02-重构设计.md) | 分层模型与门禁规则、压缩器设计、文件拆分方案、契约派生、eval 平台架构 |
| [03-实施路线与风险.md](./03-实施路线与风险.md) | M0–M5 任务板（含完成标准）、测试策略、风险与回滚 |
