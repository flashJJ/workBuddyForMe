# v4.19 契约冻结（M0）

> 状态：已冻结（2026-11-22）
> 上游：[spec.md](./spec.md) · [tasks.md](./tasks.md)
> 原则：只做加法；不改数据库 schema；破坏性改动必须升版本并登记

## 1. 备用模型链（A 线补完）

### 1.1 存储

| 键 | 位置 | 值 | 说明 |
|---|---|---|---|
| `assistant-fallback-models` | settings_kv | `Record<assistantId, modelId>` | v4.18 旧键，继续读写 |
| `assistant-fallback-chains` | settings_kv | `Record<assistantId, string[]>` | v4.19 新键，≤3，去重 |
| `conversation-fallback-models` | settings_kv | `Record<conversationId, modelId>` | v4.19 会话覆盖 |

不变量：

- 链中不得包含助手主模型；写入时校验，读取时跳过；
- 最多 3 个；重复项保留首次出现顺序去重；
- 链非空时优先于旧单值键；链为空或缺失时回落旧键；
- 会话覆盖优先于助手链；覆盖为空表示跟随助手；
- 所有模型必须存在且具备 `chat` 能力，否则写入拒绝、读取跳过；
- 删除助手/会话时清理对应键，避免孤儿数据。

### 1.2 解析顺序

```text
会话覆盖（若存在且有效）
  → 助手链（按顺序，跳过主模型与重复项）
  → 助手单值备用
  → 无备用
```

单轮最多切换 `MAX_MODEL_SWITCH_ATTEMPTS = 2` 次；已尝试模型不重复尝试；首字后不切换的规则不变。

### 1.3 API 形状

- `Assistant` 新增派生字段 `fallbackModelIds: string[]`（只读投影，不新增数据库列）；
- 助手创建/更新接受 `fallbackModelIds?: string[]`；与 `fallbackModelId` 同时提交时以链为准；
- 会话更新接受 `fallbackModelId?: string | null`；`null` 表示清除覆盖；
- 事件 `model_switched` 字段不变（`fromModelId / toModelId / reason / attempt`）。

## 2. 供应商健康度（可观测）

- 数据源：`session_events` 中 `scope=chat` 的 `model_switched` 与 `message_error`；
- 窗口：最近 7 天（按事件 `created_at`）；
- `message_error` 事件新增可选字段 `modelId`（目标模型记录 id），用于归属供应商；
- 聚合：供应商 → `{ failures: Record<code, number>, switches: number, lastFailureAt: string | null }`；
- 模型或供应商不存在时归入 `unknown`，不丢弃事件；
- 接口：`GET /api/providers/health?days=7`（1–30，默认 7）；
- 只读，不写事件、不做后台任务。

## 3. 回放历史与对比（E 线补完)

- 历史目录：`test-results/eval-replay/history/`；
- 文件名：`report-<ISO 去分隔符>.json`，内容为本次报告原文；
- 保留最近 20 份，超出按文件名时间排序删除最旧；
- `--compare=last`：读取历史中最新一份（不与本次同名），输出五项指标的相对变化（候选-历史）；
- Markdown 报告新增「与上次对比」小节；控制台同步打印；
- 历史文件与报告遵循同一隐私约束：无绝对路径、正文、令牌；
- 对比不参与阈值判定，避免历史噪声阻断当前结果。

## 4. 知识结果动作

- `GlobalSearchHit.action` 仍为 `open | resume | copy`；
- 知识域本版只使用 `open` 与 `copy`：
  - `open`：打开 `/knowledge?kb=<id>`；
  - `copy`：复制 `文档标题 — /knowledge?kb=<id>`，不含正文；
- 复制内容长度上限 300 字符；复制失败静默提示，不阻断弹层。

## 5. 窄窗与桌宠入口

- 断点：1024 / 1280 / 1440；
- 验收只查遮挡、横向滚动与不可点击，不改视觉风格、不改导航结构；
- 桌宠入口位于侧栏底部工具区，仅桌面端渲染；点击复用现有桌宠桥接，不新增窗口逻辑。
