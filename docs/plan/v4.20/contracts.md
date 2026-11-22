# v4.20 契约冻结（M0）

> 状态：已冻结（2026-11-22）
> 上游：[spec.md](./spec.md) · [tasks.md](./tasks.md)
> 原则：只做加法；迁移必须可回滚；报告与导出遵循同一隐私约束

## 1. 分段指标口径

### 1.1 四个指标

| 指标 | 起点 | 终点 | 说明 |
|---|---|---|---|
| `coldStartMs` | 页面导航开始 | 输入区首次可交互 | 仅主窗口；`/pet`、`/stage` 不计 |
| `firstTokenMs` | 发送动作 | 首个非空助手 delta 到达 | 空 delta、心跳与状态事件不计 |
| `firstParagraphMs` | 发送动作 | 首个段落可见 | 内容含换行或累计 ≥80 字符 |
| `completionMs` | 发送动作 | `done` 事件 | 错误、停止按终止时间计 |

统一使用 `performance.mark` 打点，名称固定：

```text
wbfm:app-ready / wbfm:send / wbfm:first-token / wbfm:first-paragraph / wbfm:done
```

指标只在本机计算与保存，不读取消息正文。

### 1.2 首字基线与阈值

- 客户端维护最近 20 轮成功完成的 `firstTokenMs`，存 localStorage 键 `wbfm:perf:first-token-samples`；
- P50 四舍五入到毫秒；
- 阈值公式：

```text
threshold = p50 === null ? 10_000 : Math.min(Math.round(p50 * 1.5), 10_000)
```

- 每轮最多提示一次；失败、停止、首字后不提示。

## 2. 性能报告

### 2.1 文件

- 目录：`test-results/perf/`；
- 文件名：`report-<ISO去分隔符>.json`；
- 同时写 `latest.json`（本次报告副本）；
- 保留最近 20 份，按文件名时间排序删除最旧。

### 2.2 结构

```json
{
  "suite": "chat-perf",
  "version": 1,
  "at": "ISO",
  "env": { "platform": "win32", "arch": "x64", "cpuCount": 16, "node": "22.x" },
  "scenarios": [
    {
      "name": "first-token",
      "samples": 20,
      "metrics": {
        "coldStartMs": { "p50": 0, "p95": 0 },
        "firstTokenMs": { "p50": 0, "p95": 0 },
        "firstParagraphMs": { "p50": 0, "p95": 0 },
        "completionMs": { "p50": 0, "p95": 0 }
      }
    }
  ],
  "budget": {
    "firstToken": { "p50": 0, "threshold": 0, "absoluteLimit": 10000 },
    "scrollP95FrameMs": 20
  }
}
```

- 不包含消息正文、令牌、本机绝对路径；
- 写入前复用现有敏感内容扫描；
- 同一输入两次运行除 `at` 外结构一致。

## 3. 首字提示

- 展示位置：输入区上方一条非阻断提示；
- 文案包含「首字耗时 {ms}，超过本机基线」；
- 动作：
  - 停止：调用现有停止生成；
  - 换更小模型：打开助手/模型切换，不自动切换；
  - 缩减上下文：打开会话预算/压缩入口，不自动执行；
- 提示可关闭，关闭后本轮不再出现；不写数据库、不改会话状态。

## 4. 长会话渲染

- 分块大小：50；初始渲染最近 50 条；
- 虚拟化阈值：消息数 >200；
- 虚拟化 overscan：前后各 10 条；
- 测量不可用时回落分块挂载，不阻塞渲染；
- 设置键：`chatVirtualizationEnabled?: boolean`（settings JSON，默认 true）；关闭后与 v4.19 行为一致；
- 不变量：
  - 用户停留在底部时，流式追加保持吸底；离开底部后不强制滚动；
  - 「回到底部」可用；
  - 深链目标消息必须挂载、滚动到可见并高亮；
  - `data-testid="message-list"`、消息 id 选择器不变；
- 性能预算：500 条消息、程序化滚动，p95 帧间隔 ≤20ms，无 >200ms 长任务；基线对比使用同一机器与同一场景。

## 5. 知识「以引用新建任务」

- 知识结果行新增动作「新建任务」，与「复制引用」并排；
- 点击后跳转 `/tasks?draft=<encodeURIComponent(text)>`；
- `text` 模板：`请基于文档《{title}》继续处理：{deepLink}`，不含摘要与正文，总长 ≤500 字符；
- 任务页只读取一次 `draft` 并预填目标输入框，不自动提交、不自动创建任务；
- 不新增文档-任务关联字段；不做「打开审批」。

## 6. 备用链上限

- `ASSISTANT_FALLBACK_MODELS_MAX` 从 3 改为 5；
- 助手创建/更新 schema 同步改为最多 5 个；
- 单轮切换上限仍为 `MAX_MODEL_SWITCH_ATTEMPTS = 2`；
- 第一个备用仍写回旧单值键；UI 顺序与来源提示规则不变。

## 7. 健康度导出

- 设置页健康面板新增「导出」菜单：Markdown / CSV；
- 文件名：`provider-health-<YYYYMMDD>.md|csv`；
- 列：供应商、状态、失败总数、各错误码次数、切换次数、最近失败时间；
- 只使用当前面板报告数据，不新增接口、不读取正文；
- 导出失败内联提示，不阻断面板。

## 8. 回放对比 PR 非阻断

- CI 新增任务 `replay-compare`，`continue-on-error: true`；
- 触发：`pull_request` 与 `push main`；
- 缓存 `test-results/eval-replay/history`，主分支写入，PR 恢复主分支缓存；
- 运行 `pnpm eval:replay --compare=last`，结果写入 `$GITHUB_STEP_SUMMARY`；
- 不改变现有阈值门禁；任务失败不影响合并。

## 9. 语音后续

- 寒暄快路径命中（`fastChitchat=true`）时：
  - 不创建回合后记忆提取任务；
  - 不产生 `memories` 事件；
  - 对话与语音行为不变；
- Edge TTS 流式解码为条件项：
  - 若解码器支持增量输入，按块解码并通过现有流式 sink 下发；
  - 否则保留按句缓冲，并在版本总结记录原因，不阻塞本版；
  - 两种路径都必须保留失败回退本地引擎。

## 10. 迁移与依赖

- 本版计划不新增数据库表、不做迁移；只新增 settings JSON 键；
- 如实现中发现必须迁移：必须提供回滚脚本、备份校验与升级说明，并在本文件补充记录；
- 新增依赖必须为纯 JS/WASM 或已验证可随 standalone 打包，且不得破坏桌面端构建。
