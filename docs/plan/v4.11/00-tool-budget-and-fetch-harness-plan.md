# v4.11 联网检索预算与分层抓取修复方案

## 1. 背景

一次“查资料”对话暴露了三个结构性问题：

1. **权限误伤**：`fetch_webpage` 被定为 `danger`，默认 `confirm_each` 策略下每抓一个页面都要人工授权，最长挂起 120s。表现是“工具调用被拦截 / 没有弹框 / 等几十秒”。
2. **串行执行**：同一轮模型返回的多个 `web_search` / `fetch_webpage` 逐个 `await`，总耗时线性累加。
3. **预算度量错误**：用固定字符数（20000）和固定页数（3）当闸门，与模型窗口、真实 token 成本脱钩。1M 窗口下只用了不到 1% 的容量；超限时直接拒绝，模型拿不到内容只能编。

前两项已在本次修复中落地；本方案补齐第 3 项，并把上下文窗口纳入统一预算。

## 2. 目标与非目标

**目标**

- 工具结果预算按 **token** 计量，并随模型窗口与“检索深度”档位缩放。
- 抓取结果分层注入：首屏摘要 + 提纲，模型按需调用 `read_fetched` 展开后续内容。
- 超预算时 **压缩更早的工具结果**，不拒绝新抓取。
- 模型未配置上下文长度时，按厂商提示表与溢出反馈自适应。
- 8K / 128K 窗口行为不劣化，1M 窗口可用容量显著提升。

**非目标**

- 不做自动网页爬取调度、不做来源质量评分。
- 不引入外部 tokenizer；沿用现有字符估算，由溢出重试兜底。
- 不改模型计费逻辑。

## 3. 已落地（本次修复前半）

| 改动 | 落点 |
|---|---|
| `fetch_webpage` 权限 `danger → read` | `packages/core/src/tools/fetch-webpage-tool.ts` |
| 同轮连续联网调用并发（≤3，重复 URL 不并行） | `chat/tools/loop/parallel-batch.ts`、`tool-call-loop.ts` |
| 派发前预占次数，防止同批绕过预算 | `tools/budget/turn-budget.ts` |
| HITL 测试改用 `artifact_write`（write 级） | `chat/orchestrator/__tests__/*hitl*` |

## 4. 设计

### 4.1 检索深度档位

新增设置 `searchSettings.researchDepth`：

| 档位 | 工具结果预算占可用窗口 | 单轮搜索 | 单轮抓取 | 单页输出 |
|---|---|---|---|---|
| `frugal` 节省 | 8% | 2 | 3 | 8000 字符 |
| `standard` 标准 | 15% | 4 | 6 | 12000 字符 |
| `deep` 深度 | 30% | 8 | 12 | 16000 字符 |

- 预算下限：`min(可用窗口 × 40%, 8000)`，防止 8K 窗口被压得过狠；上限：200K token。
- 单轮硬保险丝：`maxFetch / maxWebSearch` 只防死循环；超 token 预算触发压缩，不拒绝。
- 硬拒绝只在“累计工具结果超过 3× 预算”时触发，避免单轮被 MCP 巨量输出拖死。

### 4.2 分层抓取

`ToolContext.webCache`（回合级 `Map`）保存已抓取页面全文（单页上限 200K 字符，最多 12 页，LRU）。

`fetch_webpage` 变化：

1. 命中缓存且带 `offset`：直接切片返回，不再发网络请求；
2. 新抓取：正文全文入缓存，返回“提纲 + 首块正文 + 总长度 + 下一段 offset”；
3. 首块长度按档位（6000 / 8000 / 12000 字符）。

新增 `read_fetched` 工具（read 级）：

- 参数 `{ url, offset?, maxChars? }`，从回合缓存读取；
- 未抓取过该 URL 时返回可纠正错误，提示先调用 `fetch_webpage`；
- 当助手启用 `fetch_webpage` 时自动注入，无需用户勾选。

### 4.3 超预算压缩

`enforceToolResultBudget(outgoing, budgetTokens)`：

- 从最旧的 tool 消息开始，把正文替换为“首 600 字 + 尾 300 字 + 已折叠标记”；
- **最新一条工具结果永不折叠**，保证刚拿到的内容完整；
- 折叠后仍超硬保险丝 → 由预算层拒绝下一次同工具调用。

这样“多抓几页”不再被提前拒绝，而是自然挤出更早的低价值内容。

### 4.4 生效上下文窗口

`resolveEffectiveContextWindow(model)`：

1. 模型记录显式配置（`models.context_window`）优先；
2. 未配置时按 `modelId` 匹配厂商提示表（DeepSeek/Qwen 128K、Claude 200K、Gemini 1M 等）；
3. 仍未命中回落 8192；
4. 结果统一受 `HARNESS_MAX_CONTEXT_WINDOW` 上限约束。

### 4.5 溢出自动重试

- `@wbfm/ai` 暴露 `isContextOverflowError`；
- 模型返回上下文超限时，保留 system 消息，从最近的 user 边界保留约 50% 历史，**重试一次**；
- 重试仍失败才向用户报错；
- 该机制同时覆盖“厂商提示表估值偏大”的场景。

### 4.6 预算记账

`ToolTurnBudget` 改为：

```ts
interface ToolTurnBudget {
  limits: ToolTurnLimits;   // 由窗口 + 档位解析
  webSearch: number;
  fetch: number;
  toolTokens: number;       // 所有工具输出累计（估算）
}
```

- 次数在派发前 `reserve`；
- 输出 token 在执行后记账；
- 压缩器只看 `toolTokens` 与 `limits.toolResultTokens` 的关系。

## 5. 数据契约

```ts
// shared/constants
type ResearchDepth = 'frugal' | 'standard' | 'deep';

// shared/types SearchSettings
researchDepth: ResearchDepth;
```

`searchSettingsSchema` 增加带默认值的枚举；服务端 `resolveSearchSettings` 对非法值回落到 `standard`。

## 6. 任务拆解

1. shared：常量、schema、类型、i18n。
2. budget：限额解析、token 记账、压缩器、硬保险丝。
3. fetch：页面缓存、`read_fetched`、提纲抽取、工具自动注入。
4. window：生效窗口解析、溢出错误识别与重试。
5. wire：orchestrator 传窗口与档位、flow-execution 同步、设置页开关。
6. verify：单测、类型检查、lint、结构/行数/循环门禁。

## 7. 验收标准

- 8K 窗口：单轮预算与现有行为等价或更宽松，不出现新的“无内容可用”。
- 128K 窗口：标准档可连续抓取 6 页，旧结果自动折叠，最终回答不丢最近内容。
- 1M 窗口：标准档工具结果预算约 135K token，深度档约 270K（受 200K 硬顶）。
- 重复调用 `read_fetched` 不产生新网络请求。
- 上下文溢出错误在一次重试后成功率可观测提升。
- 全部单测、`pnpm check` 门禁通过。

## 8. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 厂商窗口提示表不准 | 溢出重试兜底；模型设置里可手填覆盖 |
| 压缩过早导致细节丢失 | 最新一条永不折叠；折叠标记提示可重新抓取 |
| 1M 窗口成本失控 | 深度档上限 200K token + 单轮页数上限 |
| 新工具改变工具声明 | `read_fetched` 仅在启用 `fetch_webpage` 时注入 |

回滚：设置 `researchDepth=frugal` 可回到接近修复前的行为；代码层面可单独回退 budget/fetch/window 三个模块。

## 9. 实现落点

| 模块 | 文件 |
|---|---|
| 档位与常量 | `packages/shared/src/constants/tools.ts` |
| 设置契约 | `packages/shared/src/schemas/ops/settings.ts`、`services/search/search-settings.ts` |
| 预算解析与记账 | `packages/core/src/tools/budget/turn-budget.ts` |
| 旧结果压缩 | `packages/core/src/chat/tools/loop/tool-result-budget.ts` |
| 分层抓取 | `packages/core/src/tools/fetch-webpage-tool.ts`、`tools/web/read-fetched-tool.ts`、`tools/html-extractor.ts` |
| 工具注入 | `packages/core/src/tools/tool-runtime.ts` |
| 生效窗口 | `packages/core/src/chat/context/window/effective-window.ts` |
| 溢出重试 | `packages/core/src/chat/context/window/shrink-messages.ts`、`chat/tools/tool-runner.ts` |
| 接线 | `chat/context/turn-context-assembly.ts`、`chat/orchestrator/chat-orchestrator.ts`、`flow/run/flow-execution.ts` |
| 设置页 | `apps/web/src/features/settings/tools/search-settings-panel.tsx` |

