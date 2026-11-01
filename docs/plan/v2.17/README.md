# v2.17 方案：可连通——厂商能力矩阵与内置联网工具

> 状态：🚧 规划中（2026-11-02），待 M0 评审冻结
> 上一正式版：v2.16.0（可导航：目录按能力收拢、入口统一、页面少拼装）
> 主题一句话：**模型接得上、网页搜得到、能力装得进——厂商差异可描述，联网工具可开箱，能力安装有审批。**
> 来源候选：[内置联网工具与能力代理 backlog](../roadmap/builtin-tools-backlog.md) · [多厂商兼容 backlog](../roadmap/vendor-compat-backlog.md)

## 1. 版本主题与目标

v2.16 把「找代码、改代码、加代码」的目录与入口成本降下来后，下一层体验断点集中在三处：

1. **接不上**：所有云厂商都走同一个 `openai-compatible` 适配器，默认假设 `GET /models` 存在；火山方舟 Agent Plan / Coding Plan 等厂商不提供该端点，v2.16 只做了最小修复（404/405 归一化 + 首字探活兜底 + 两个预设）。
2. **搜不到**：内置工具只有时间、知识检索、网页读取、截图与待办，没有 `web_search`；未安装能力包、未勾选工具时，Agent 无法联网搜索。`fetch_webpage` 只能读取给定 URL。
3. **装不进**：能力包需要手动上传 ZIP，MCP 需要手动填命令或选预置；模型不能按意图发现能力、建议安装，也不能在下一轮直接使用新工具。

v2.17 把两个候选主题合并成一个版本，围绕「可连通」做三条主线：

- **厂商可描述**：厂商差异从硬编码预设中抽出来，变成可测试的厂商描述与能力矩阵；
- **联网可开箱**：内置 `web_search` + `fetch_webpage`，搜索后端可插拔，助手级开关，来源可引用；
- **能力可装载**：能力目录 + `capability_search` / `capability_install`，用户审批后安装，下一轮绑定只读工具。

### 1.1 成功指标（可验收）

| 指标 | v2.16.0 基线 | v2.17.0 目标 |
|---|---|---|
| 新增一家 OpenAI 兼容厂商 | 改预设常量 + 可能的适配分支 | 只新增一个厂商描述文件，不改适配器与页面 |
| 不提供 `GET /models` 的厂商 | 可手动填 Model ID + 首字探活兜底 | 完整走完「配置 → 添加模型 → 三态测试 → 对话」 |
| 连接测试语义 | 二元成功 / 失败 | 三态：已验证 / 可达但无法验证 / 失败 |
| 未安装能力包时联网搜索 | 不可用 | 配置搜索服务后可用，回答带来源引用 |
| 能力发现与安装 | 手动 ZIP / 手动 MCP | 目录搜索 → 审批 → 安装 → 下一轮只读工具可用 |
| 搜索隐私与审计 | 不适用 | 密钥不出本机；审计不落查询正文；结果按不可信内容处理 |
| 行为回归 | 单测 2882 / Web e2e 139 / 桌面 10/11 | 不降级；新增用例覆盖本版能力 |
| 首屏包体 | `/settings` 479 kB | 增长 ≤5%；搜索适配器不进客户端 bundle |
| 迁移 | `LATEST_SCHEMA_VERSION = 42` | 零迁移，保持 42 |

## 2. 现状与证据

### 2.1 厂商侧

| 事实 | 证据 |
|---|---|
| 协议只有 `openai-compatible` 与 `ollama` | [enums.ts](../../../packages/shared/src/constants/enums.ts) 的 `PROVIDER_PROTOCOLS` |
| 厂商预设是硬编码常量，含 Base URL / Key 地址 / 推荐模型 | [provider-presets.ts](../../../packages/shared/src/constants/provider-presets.ts) 的 `PROVIDER_PRESETS` |
| 模型发现只调用 `GET /models` | [list-models.ts](../../../packages/ai/src/adapters/openai/list-models.ts) 的 `openAiListModels` |
| 404/405 被归一化为 `models_unsupported`，提示手填 Model ID | [provider-error.ts](../../../packages/ai/src/errors/provider-error.ts) 的 `modelsUnsupported` |
| 连接测试先走 `/models`，失败且有对话模型时改用首字探活 | [provider-service.ts](../../../packages/core/src/services/provider/provider-service.ts) 的 `testConnection` |
| 连接测试返回 `{ ok: true }` 或抛错，没有三态 | 同上 |
| 没有厂商能力矩阵 / 描述文件目录 | 仓库无 `vendors/` registry，预设与适配逻辑分散在 shared / ai / core |

### 2.2 工具与能力侧

| 事实 | 证据 |
|---|---|
| 内置工具只有 5 个只读工具 + 桌面工具组，没有 `web_search` | [tools/index.ts](../../../packages/core/src/tools/index.ts) 的 `ALL_TOOLS` |
| 工具按助手 `enabledTools` 白名单注入，默认只有 `current_time` | [tool-runtime.ts](../../../packages/core/src/tools/tool-runtime.ts) 的 `buildTools` |
| `fetch_webpage` 只能读取给定 URL | [fetch-webpage-tool.ts](../../../packages/core/src/tools/fetch-webpage-tool.ts) |
| 能力包六类：skill / mcp / workflow / pet-action / event-script / report-widget | [capability.ts](../../../packages/shared/src/schemas/capability/capability.ts) 的 `CAPABILITY_KINDS` |
| 能力包安装入口接收 ZIP，校验后落盘并自动启用 | [capability-service.ts](../../../packages/core/src/capabilities/capability-service.ts) 的 `install` |
| MCP 预置只有 4 个，仍需手动添加与授权 | [mcp-presets.ts](../../../packages/shared/src/constants/mcp-presets.ts) |
| 单轮工具集在出站前构建一次，安装后不能当轮热替换 | [turn-context-assembly.ts](../../../packages/core/src/chat/context/turn-context-assembly.ts) |
| 没有能力目录 schema、`capability_search`、`capability_install` | 仓库无对应实现 |

### 2.3 结论

- 「自带搜索」是**内置工具**问题，不能靠能力包解决；能力包不携带任意工具代码。
- 「自主装能力」是**目录 + 安装代理 + 动态绑定**问题，不是新增一种 capability kind。
- 「多厂商兼容」是**厂商描述 + 发现策略 + 测试语义**问题，不是为每家复制一套聊天管线。

## 3. 设计规则（拟在 M0 冻结）

### 3.1 厂商描述与能力矩阵

新增 `packages/ai/src/vendors/`：

```ts
interface VendorDescriptor {
  id: string;
  name: string;
  baseUrl: string;
  keyUrl?: string;
  protocol: 'openai-compatible' | 'ollama';   // v2.17 不扩协议
  discovery: 'openai-models' | 'ollama-tags' | 'manual-only';
  recommendedModels: Array<{ modelId: string; capabilities: ModelCapability[] }>;
  modelIdHint?: string;
  keyScope?: 'data' | 'plan' | 'coding';
  notes?: string;
}
```

规则：

- 厂商差异只写在描述文件；适配器只按 `protocol` 选择，不为单个厂商 fork 聊天管线。
- `PROVIDER_PRESETS` 保留现有 id 与展示名，由 registry 派生，避免两处维护；设置页表单行为不变。
- 能力矩阵字段可被 UI 读取：是否支持模型列表、是否支持对话/向量/视觉、Model ID 怎么填、Key 属于哪个套餐。
- v2.17 **不新增 Anthropic / Responses 协议**；协议扩展留作后续版本，避免把「兼容」一次性做成大重构。

### 3.2 模型发现策略

按优先级尝试，全部失败才要求手填：

1. `GET /models`（OpenAI 兼容）；
2. 厂商专用接口（Ollama `/api/tags` 等）；
3. 描述文件里的「推荐模型 ID」；
4. 手动填写（永远保留）。

错误语义必须区分：

| 情况 | 语义 | UI |
|---|---|---|
| 404 / 405 | 端点不存在 | 提示手填 Model ID；不显示「鉴权失败」 |
| 401 / 403 | 鉴权失败 | 提示检查 Key / 套餐作用域 |
| 429 | 限流 | 提示稍后重试，不自动狂重试 |
| 超时 / 网络 | 不可达 | 提示检查 Base URL / 网络 |
| 空列表 | 无模型 | 引导手填或使用推荐模型 |

### 3.3 连接测试三态

新增返回结构（替换现有 `{ ok: true }`）：

```ts
type ProviderConnectionStatus = 'verified' | 'reachable_unverified' | 'failed';

interface ProviderConnectionResult {
  status: ProviderConnectionStatus;
  checks: Array<{
    step: 'models' | 'chat-probe' | 'protocol';
    ok: boolean;
    message?: string;
  }>;
  modelId?: string;
}
```

规则：

- `verified`：模型列表可用，或首字探活成功；
- `reachable_unverified`：端点可达但没有可验证的对话模型，或厂商不提供列表且用户尚未添加模型；
- `failed`：鉴权 / 网络 / 协议明确失败；
- 不伪造成功；无模型时明确说「先添加模型再测试」；
- 首字探活只使用已配置的对话模型，不偷偷创建模型。

### 3.4 内置联网工具

新增 `web_search`：

| 项 | 约定 |
|---|---|
| 权限 | `read` |
| 参数 | `query` 1–200 字；`maxResults` 1–8（默认 5）；`freshness`、`site`、`locale` 可选 |
| 返回 | `{ results: [{ title, url, snippet, source, publishedAt? }], provider }`，不含正文 |
| 正文 | 由 `fetch_webpage` 按需读取；搜索不自动抓全部结果 |
| 超时 | 10s；错误区分「未配置 / 鉴权 / 限流 / 网络 / 空结果」 |
| 审计 | 记录 provider、结果数、耗时、成功/失败；**不落完整查询与结果正文** |

搜索后端抽象（建议 `packages/ai/src/search/`）：

```ts
interface SearchProvider {
  id: string;
  search(input: SearchInput, signal?: AbortSignal): Promise<SearchResponse>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
}
```

首批适配器：Tavily / Brave / Exa / SerpAPI / 博查等 API Key，或自建 SearXNG。**不做默认 HTML 抓取**；无 Key 时明确提示去配置，不伪造结果。

安全规则：

- 搜索词会离开本机，助手开关与首次使用必须明确告知；
- 搜索结果按外部不可信数据处理：去 HTML、去脚本、限长、提示注入防护；
- `fetch_webpage` 复用既有 SSRF 防护；搜索 endpoint 只允许 https，私网默认拒绝，SearXNG 自建需显式允许；
- 每会话每分钟查询上限、单轮结果数上限、失败退避；429 给出明确文案；
- 回答与分享保留来源列表。

### 3.5 能力目录与安装代理

新增 `CapabilityCatalogEntry`（shared schema）：

| 字段 | 说明 |
|---|---|
| `id` / `name` / `kind` | 对应能力包 |
| `description` / `tags` | 意图匹配 |
| `permissions` / `effects` | 安装前展示 |
| `source` | `bundled` 或 `mcp-preset` |
| `version` / `checksums` / `signature` | 复用能力包校验 |
| `toolNames` | 安装后预计新增的工具 |
| `installStrategy` | `bundled-pack` 或 `mcp-preset` |

首批只做「随应用内置的精选包 + 现有 MCP 预置」，不开放任意远程下载；目录随版本发布更新。

工具：

- `capability_search(query, kind?)`：只读，按意图返回候选与权限、预计新增工具；
- `capability_install(catalogId, reason?)`：`write`，必须 HITL 审批；审批框展示来源、签名、权限、effect、新增工具；
- 可选 `capability_list()`：列出已安装/已启用能力，避免重复安装。

安装后绑定：

1. 安装/启用成功；
2. 只读工具自动追加到当前助手 `enabledTools`；
3. 危险工具保持显式勾选；
4. 返回「已安装，下一轮可用」；
5. 下一轮 `buildTools` 重新构建工具声明。

**不做同轮热替换**；安装失败按能力服务既有 fail-closed 语义回滚，不改白名单。

### 3.6 权限、隐私与治理

- 能力安装：默认只在交互式会话可用；无人值守 / 定时 Agent 拒绝静默安装。
- 搜索：密钥本地加密、掩码展示；查询不入审计正文；不共享 Key、不做云端搜索代理。
- 能力包：只允许内置或可信签名来源；签名策略沿用 `off / warn / require`。
- 审计：`capability_install_requested / installed / denied`、`web_search`（不含查询正文）。
- 零迁移：settings JSON、`assistant.enabledTools` JSON、既有能力包表；不新增表 / 列 / 索引。

## 4. 功能清单

### 4.1 P0（本版必须）

| # | 功能 | 用户故事 | 验收 |
|---|---|---|---|
| P0-1 | 厂商 registry 与能力矩阵 | 新增一家厂商时，只改一个描述文件 | 预设 id 不变；typecheck / 单测通过 |
| P0-2 | 模型发现策略 | 不提供 `/models` 的厂商也能添加模型 | 方舟 Agent Plan / Coding Plan 全链路可用 |
| P0-3 | 连接测试三态 | 用户知道是「验证成功」「能连但没模型」还是「失败」 | API / UI / e2e 覆盖三态；不伪造成功 |
| P0-4 | 内置 `web_search` + 网页工具组 | 没装能力包也能联网搜索 | 配置搜索服务后搜索并带来源回答 |
| P0-5 | 搜索配置、隐私与审计 | 用户知道查询会离开本机，且可审计 | 密钥掩码；审计无正文；限流与错误文案 |
| P0-6 | 厂商 / 搜索回归 | 不破坏现有配置与对话 | 单测 / e2e / 桌面冒烟不降级 |

### 4.2 P1（本版争取，不阻塞 P0 发布）

| # | 功能 | 用户故事 | 验收 |
|---|---|---|---|
| P1-1 | 能力目录与 `capability_search` | Agent 能按意图找到能力并说明用途/权限 | 目录搜索、kind 过滤、候选展示 |
| P1-2 | `capability_install` + HITL | 用户批准后才安装，且知道会新增什么工具 | 拒绝不落库；签名/依赖/失败回滚 |
| P1-3 | 安装后下一轮绑定 | 安装后下一轮就能用只读工具 | 危险工具不自动绑定；卸载仍走能力页 |
| P1-4 | 契约测试与 opt-in 真 Key 冒烟 | 厂商 / 搜索适配器可持续回归 | 默认 CI 不跑真实 Key；nightly/手动可跑 |

### 4.3 P2（明确不做 / 后续版本）

- Anthropic Messages / OpenAI Responses 协议扩展（v2.17 不纳入，除非 M0 评审改口径）；
- 供应商原生搜索（模型侧 web search / grounding）；
- 同轮动态工具热替换；
- 远程能力市场、任意 URL 下载、云端 Key/搜索代理；
- 多设备能力同步、团队共享。

## 5. 架构影响

| 层 | 改动 |
|---|---|
| `packages/ai` | 新增 `vendors/` 描述与 registry；新增 `search/` 适配器；现有 OpenAI / Ollama 适配器不改行为 |
| `packages/shared` | 新增搜索设置 / 结果 schema、能力目录 schema、搜索 provider 预设；`PROVIDER_PRESETS` 改为 registry 派生 |
| `packages/core` | provider service 接入 registry 与三态测试；tool runtime 注册 `web_search`；新增搜索服务与能力目录服务；审计补事件 |
| `apps/web` | 供应商面板：模型发现与三态徽章；设置页新增「联网搜索」；助手工具表单新增 `web_search`；能力页/对话审批框 |
| `apps/desktop` | 不改主进程 / preload；只需确认打包产物包含新 server 模块 |
| 数据库 | **零迁移**，`LATEST_SCHEMA_VERSION = 42` |
| 依赖 | 优先使用现有 HTTP 客户端；不引入搜索 SDK；搜索适配器仅服务端 |

## 6. 里程碑

| 里程碑 | 内容 | 出口 |
|---|---|---|
| M0 契约冻结 | 厂商 descriptor / 搜索 provider / 目录 schema / 三态返回 / 错误码 / UI 文案 / 搜索后端选型 | 契约与评审记录落盘；基线数字可复核 |
| M1 厂商矩阵与发现 | registry、预设迁移、发现策略、错误语义 | 新增厂商只改描述文件；方舟全链路可用 |
| M2 三态连接测试 | API 返回结构、首字探活、设置页徽章与文案 | 三态可测；不伪造成功 |
| M3 内置联网工具 | 搜索适配器、`web_search`、设置页、助手开关、引用、隐私/审计/限流 | 未装能力包可搜索；单测 / e2e 通过 |
| M4 能力目录与安装代理 | 目录、`capability_search` / `capability_install`、HITL、下一轮绑定 | 审批后可安装并使用；未批准不落库 |
| M5 硬化与回归 | 厂商 / 搜索契约测试、opt-in 真 Key 冒烟、全量 check / 单测 / e2e / 桌面、包体 | 回归不降级；零迁移 |
| M6 验收与发布 | 版本 2.17.0、验收文档、发行说明、安装包与 Release | Release 置 Latest |

> M4 若进度不足，允许把「能力目录/安装代理」整体顺延到 v2.18，但 P0（厂商 + 内置搜索）必须在本版闭环；该偏差需在 M5 明确记录。

## 7. 风险与取舍

| 风险 | 影响 | 缓解 |
|---|---|---|
| 厂商差异继续出现 | 新厂商又需要特判 | 描述文件只承载数据；适配器按协议；错误语义统一 |
| 搜索后端网络 / 额度不稳定 | 搜索失败或体验不可预期 | 多 provider 可插拔、测试连接、明确错误；不默认 HTML 抓取 |
| 搜索结果提示注入 | 模型被外部内容带偏 | 去 HTML、标注外部数据、限长、危险工具不自动绑定 |
| 自动安装被滥用 | 权限扩大、进程风险 | HITL、签名、只读工具自动、危险工具手动、次数限制与审计 |
| 工具声明膨胀 | 上下文预算与模型选择困难 | 目录按意图召回；默认只绑定只读；描述限长 |
| 连接测试 API 变更 | 现有 UI / 测试断裂 | 只改本仓库唯一消费方；e2e 覆盖三态；保留兼容字段一个版本 |
| 协议扩展诱惑 | 版本失控 | v2.17 明确不扩协议；另开版本评估 Anthropic / Responses |
| 密钥与查询隐私 | 用户不信任 | 密钥本地加密、掩码；查询不入审计正文；首次使用明确提示 |

## 8. Non-Goals

- 不做账号托管、代管 Key、云端搜索代理；
- 不做远程能力市场、任意 URL 下载、静默安装；
- 不执行能力包内任意代码；MCP 仍按既有进程、权限与审批治理；
- 不在 v2.17 引入 Anthropic / Responses 双协议；
- 不做同轮动态工具热替换；
- 不改现有对话 UI 主结构、不重写供应商表单；
- 不做数据库迁移、不改表 / 列 / 索引。

## 9. 验收口径

1. 新增一家 OpenAI 兼容厂商只新增一个描述文件；现有预设 id 与表单行为不变。
2. 不提供 `GET /models` 的厂商可完整走完「配置 → 添加模型 → 三态测试 → 对话」；三态不伪造成功。
3. 未安装任何能力包、配置搜索服务后，助手可完成「搜索 → 读取 → 带来源回答」；未配置时明确提示。
4. 搜索密钥不出本机；查询不入审计正文；搜索结果按外部不可信内容处理。
5. Agent 可以搜索能力目录、展示权限与来源；经用户批准后安装，未批准不落库；只读工具下一轮可用，危险工具手动。
6. 零迁移；`pnpm check` / 单测 / Web e2e / 桌面冒烟不降级；`/settings` First Load JS 增长 ≤5%。
7. 版本 2.17.0，安装包 + blockmap + latest.yml，Release 置 Latest。

## 10. 与 backlog 的对应

| 来源 | 本版处置 |
|---|---|
| vendor-compat V1 厂商矩阵 | P0-1 / M1 |
| vendor-compat V2 发现与测试 | P0-2、P0-3 / M1-M2 |
| vendor-compat V3 协议扩展 | P2，v2.17 不做 |
| vendor-compat V4 回归 | P1-4 / M5 |
| BT-01 `web_search` 契约 | P0-4 / M3 |
| BT-02 SearchProvider 适配器 | P0-4 / M3 |
| BT-03 搜索设置与助手开关 | P0-5 / M3 |
| BT-04 来源引用 | P0-4 / M3 |
| BT-05 隐私 / 审计 / 限流 / SSRF | P0-5 / M3 |
| BT-06 搜索 mock 与 e2e | P0-6 / M5 |
| CB-01 能力目录 schema | P1-1 / M4 |
| CB-02 `capability_search` | P1-1 / M4 |
| CB-03 `capability_install` + HITL | P1-2 / M4 |
| CB-04 安装后绑定 | P1-3 / M4 |
| CB-05 目录与安装 e2e | P1-4 / M5 |
| EX-01/02/03 | P2，后续版本 |

## 11. 待决策（M0 评审）

1. 默认搜索后端：博查 / 自建 SearXNG / Tavily / Brave，哪个作为首选预设？
2. `web_search` 对新助手默认开还是默认关？（建议默认关，首次开启给一键引导）
3. 连接测试 API 是否允许破坏性升级为三态返回？（建议允许，本仓库只有设置页一个消费方）
4. 能力目录首批种子包选哪些？（建议每类至少 1 个内置示例 + 4 个 MCP 预置）
5. 自动绑定是否只限只读工具？（建议是，危险工具保持显式勾选）
6. 能力目录是否允许导入第三方本地 ZIP 后进入「我的目录」？（建议后续版本再评估）

---

[^1]: 当前厂商实现与 v2.16 最小修复见 [provider-presets.ts](../../../packages/shared/src/constants/provider-presets.ts)、[list-models.ts](../../../packages/ai/src/adapters/openai/list-models.ts)、[provider-service.ts](../../../packages/core/src/services/provider/provider-service.ts)。
[^2]: 当前工具与能力安装链路见 [tools/index.ts](../../../packages/core/src/tools/index.ts)、[tool-runtime.ts](../../../packages/core/src/tools/tool-runtime.ts)、[capability-service.ts](../../../packages/core/src/capabilities/capability-service.ts)。
