# v4.18 契约冻结（M0）

> 状态：已冻结（2026-11-22）
> 上游：[spec.md](./spec.md) · [tasks.md](./tasks.md)
> 原则：只做加法；破坏性改动必须升版本并在本文件登记

## 1. 模型失败分类（A 线）

事实源：[model-failure.ts](../../../packages/shared/src/errors/model-failure.ts)（从 `@wbfm/shared/errors` 导入）

| code | 触发 | 首字前自动切换 | UI 动作 |
|---|---|---|---|
| `auth_failed` | 401 / 403 | 否 | 检查密钥、换模型 |
| `rate_limited` | 429 | 是 | 自动切换；失败后重试 |
| `timeout` | 连接或首字超时 | 是 | 自动切换；失败后重试 |
| `stream_interrupted` | 已建立连接但中途断流 | 仅首字前 | 首字后只给「换模型继续」 |
| `context_overflow` | 上下文超限 | 否 | 压缩或换大窗口模型 |
| `provider_5xx` | 供应商 5xx | 是 | 自动切换；失败后重试 |
| `unknown` | 其他 | 否 | 重试、查看诊断 |

不变量：

- 首字后一律不自动切换（`canAutoSwitchModel` 返回 false），避免重复输出；
- 单轮最多自动切换 `MAX_MODEL_SWITCH_ATTEMPTS = 2` 次；
- 切换事件固定四字段：`fromModelId / toModelId / reason / attempt`，不记录正文；
- UI 只消费 `code`，不解析供应商原始报文。

## 2. 跨域检索结果（C 线）

事实源：[schemas/search/index.ts](../../../packages/shared/src/schemas/search/index.ts)（从 `@wbfm/shared/schemas` 导入）

结果项：

| 字段 | 类型 | 约束 |
|---|---|---|
| `domain` | `chat \| task \| flow \| meeting \| knowledge` | 五域枚举 |
| `id` | string | 域内稳定标识，≤200 |
| `title` | string | 非空，≤200 |
| `snippet` | string | 单行压缩，≤240，可为空 |
| `timestamp` | ISO string \| null | 无可靠时间时为 null |
| `deepLink` | string | 站内深链，≤2048，不自拼绝对路径 |
| `action` | `open \| resume \| copy` | 结果可直接行动 |

上限与并发：

- 单域最多 `perDomain = 10` 条，总计最多 `total = 50` 条；
- 知识库单库最多 5 条，并发 4；
- 查询至少 2 个字符；`knowledge` 不走 `session_events`，只查文档标题/来源/摘要；
- 单域失败时该组 `failed=true`，其他域照常返回。

## 3. 离线 A/B 回放报告（E 线）

事实源：[replay-contract.mjs](../../../scripts/eval/lib/replay-contract.mjs)

指标（固定五项）：

| 指标 | 方向 | 绝对下限 | 相对退化上限 |
|---|---|---|---|
| `budgetUsage` | 越低越好 | — | +0.05 |
| `truncationRate` | 越低越好 | — | +0.05 |
| `memoryRetention` | 越高越好 | 0.90 | −0.05 |
| `citationRetention` | 越高越好 | 0.80 | −0.05 |
| `constraintRetention` | 越高越好 | 0.95 | −0.05 |

报告骨架：

```json
{
  "suite": "eval-replay",
  "version": 1,
  "at": "ISO",
  "golden": "context-golden.json",
  "strategies": { "baseline": "string", "candidate": "string" },
  "metrics": { "baseline": {}, "candidate": {} },
  "cases": [],
  "thresholds": {}
}
```

约束：

- 输出固定落 `test-results/eval-replay/report.json` 与 `report.md`；
- 同一输入两次运行结果一致（`at` 为唯一允许的差异）；
- 报告不得包含绝对路径、聊天正文、Bearer 令牌或 API Key；
- 任一指标低于下限、相对退化超阈值或 `budgetUsage > 0.95` 时退出码非 0；
- 首期接入 nightly 非阻断，稳定后转 PR 门禁。
