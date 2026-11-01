# 多厂商兼容模块（候选版本 backlog）

> 记录时间：2026-11-01 ｜ 状态：已并入 v2.17 规划（2026-11-02，见 [v2.17 方案](../plan/v2.17/README.md)）；本文件保留为来源 backlog
> 触发：v2.15 真机验证时，火山方舟 Agent Plan 供应商测试连接失败（`GET /api/plan/v3/models` 返回 404），模型列表为空。

## 1. 本次已修复（v2.16）

| # | 问题 | 处理 |
|---|---|---|
| 1 | 连接测试与「从远端拉取」都依赖 `GET /models`；火山方舟 Agent Plan / Coding Plan 不提供该端点，404 被当成通用供应商错误 | `openAiListModels` 把 404/405 归一化为 `models_unsupported`，提示手动填写 Model ID |
| 2 | 有模型时仍无法验证连接 | `providers.testConnection` 遇到 `models_unsupported` 且存在对话模型时，改用流式首字探活 |
| 3 | 厂商预设缺少火山方舟 | 新增「火山方舟（Ark）」与「火山方舟 Agent Plan」两个预设（Base URL / Key 申请直达） |

涉及的 Base URL：

| 套餐 | Base URL | 说明 |
|---|---|---|
| 方舟数据面 | `https://ark.cn-beijing.volces.com/api/v3` | 普通方舟 API Key |
| Agent Plan | `https://ark.cn-beijing.volces.com/api/plan/v3` | 必须使用 Agent Plan 专属 Key；含 `/plan`，不能与数据面混用 |
| Coding Plan（OpenAI 协议） | `https://ark.cn-beijing.volces.com/api/coding/v3` | 套餐专属 Key |
| 三方工具 Anthropic 协议 | `https://ark.cn-beijing.volces.com/api/plan` | 本项目暂不支持 Anthropic 协议 |

## 2. 为什么不是「加一个 DeepSeek 就完事」

当前所有云厂商都走同一个 `openai-compatible` 适配器，默认假设：

1. `GET {baseUrl}/models` 存在；
2. `POST {baseUrl}/chat/completions` 是唯一对话协议；
3. `POST {baseUrl}/embeddings` 是唯一向量协议；
4. 401/404/429 等状态码语义一致。

真实厂商在这四点上都有差异：

| 厂商 / 套餐 | `GET /models` | 对话协议 | 向量 | 备注 |
|---|---|---|---|---|
| DeepSeek | ✅ | chat completions | ✅ | 已验证 |
| Moonshot / 智谱 / 硅基流动 / OpenRouter | ✅ | chat completions | 部分 | 基本可直接用 |
| 火山方舟数据面 | 不稳定 / 部分账号 404 | chat completions | ✅ | 需手动填 Model ID 或推理接入点 `ep-*` |
| 火山方舟 Agent Plan | ❌ 404 | chat completions（`/api/plan/v3`） | ✅（专属模型） | 套餐专属 Key；模型名由套餐决定 |
| 火山方舟 Coding Plan | 视套餐而定 | `/api/coding/v3` | — | 专属 Key，不能混用 |
| 阿里云百炼 | ✅ | chat completions（`compatible-mode/v1`） | ✅ | 多模态模型 ID 与能力需匹配 |
| Ollama | ❌（走原生 `/api/tags`） | `/v1/chat/completions` | `/api/embeddings` | 已单独适配 |

## 3. 后续版本建议范围（不阻塞 v2.16）

### 3.1 厂商能力矩阵（P0）

- 新增 `packages/ai/src/vendors/`：
  - `vendor-registry.ts`：厂商 id、显示名、Base URL 模板、Key 申请地址、协议、能力探测策略；
  - 每个厂商一个描述文件（如 `volcengine.ts`、`dashscope.ts`），只描述差异，不复制适配器；
  - 能力矩阵字段：`supportsModelList`、`supportsChat`、`supportsEmbeddings`、`supportsVision`、`modelIdHint`、`keyScope`（数据面 / 套餐）。
- 预设目录从 `shared/constants/provider-presets.ts` 迁到 registry 生成，避免两处维护。
- 设置页按厂商展示「Model ID 怎么填」的提示（如方舟填 Model ID 或 `ep-*` 接入点）。

### 3.2 模型发现策略（P0）

按优先级尝试，全部失败才提示手动填写：

1. `GET /models`；
2. 厂商专用列表接口（如 Ollama `/api/tags`）；
3. 配置页内置「推荐模型 ID」；
4. 手动填写（永远保留）。

失败语义：区分「端点不存在（404/405）」「鉴权失败（401/403）」「限流（429）」「网络失败」，前端文案不同。

### 3.3 连接测试协议（P0）

- 测试顺序：`/models` → 一次最小对话探活 → 厂商专用 ping；
- 探活结果区分「已验证」「可达但无法验证」「失败」三态，不再用二元成功/失败；
- 探活使用已配置的对话模型；无模型时明确提示先添加模型，不伪造成功。

### 3.4 协议差异（P1）

- 评估 Anthropic Messages 协议（火山方舟 `/api/plan`、Claude 官方）作为第二种适配器；
- 评估 OpenAI Responses API（方舟已支持）是否值得接入；
- 向量接口差异：部分厂商 embedding 路径不是 `/embeddings`，需在厂商描述中声明；
- 多模态能力：模型能力标签与厂商模型 ID 绑定，避免把视觉模型当纯文本用。

### 3.5 运维与可回归（P1）

- 真实 Key 冒烟：opt-in（`WBFM_REAL_PROVIDER=1`）的 nightly 脚本，不在 CI 默认跑；
- 每个厂商至少一条契约测试：模型列表、连接测试、一轮对话、一次向量；
- 预设模型 ID 会过期：不在代码里写死具体日期版本，改由厂商描述给「当前推荐」并在 UI 标注「以控制台为准」；
- 错误文案不再把 404 统一成「供应商配置错误」。

### 3.6 Non-Goals

- 不做账号托管、代管 Key、云转发；
- 不做计费 / 价格展示；
- 不为了兼容某一家而复制一套聊天管线；
- 不在本版本引入 Anthropic / Responses 双协议，除非有明确用户需求。

## 4. 建议里程碑拆分

| 里程碑 | 内容 | 出口 |
|---|---|---|
| V1 厂商矩阵 | `vendors/` registry + 预设迁移 + 设置页 Model ID 提示 | 新增厂商只改一个描述文件 |
| V2 发现与测试 | 多策略模型发现、三态连接测试、错误语义细分 | 火山方舟 Agent Plan 全链路可用 |
| V3 协议扩展 | 评估并接入第二种对话协议（可选） | 至少一家非 chat-completions 厂商可对话 |
| V4 回归 | 厂商契约测试 + opt-in 真 Key 冒烟 | 厂商矩阵全部有测试覆盖 |

## 5. 验收口径（未来版本）

1. 新增一家 OpenAI 兼容厂商只需新增一个厂商描述文件，不改适配器与页面。
2. 不提供 `GET /models` 的厂商可以完整走完「配置 → 添加模型 → 连接测试 → 对话」。
3. 连接测试不伪造成功；无法验证时明确三态。
4. 厂商差异有测试覆盖；预设模型 ID 不写死日期版本。
