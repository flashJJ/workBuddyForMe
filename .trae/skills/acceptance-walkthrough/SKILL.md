---
name: acceptance-walkthrough
description: 一键跑本仓库 v4.11 自动验收——起 Fake Web + 真实 Next、按场景剧本跑联网工具链路、汇总 PASS/FAIL 与指标报告，并给出失败定位入口。当用户说「跑一下验收 / 验收联网链路 / 回归 v4.11 / 看看预算折叠 / 回放一段 trace」时使用；不用于单测、纯代码审查或安全审计。
---

# 自动验收 walkthrough（v4.11）

目标：用一条可复现的命令链回答「这版能不能过」，产出可直接贴进评审的结论与报告；失败时把定位收窄到用例与代码落点，不顺手改产品逻辑。

## 0. 适用边界

- 适用：联网工具链路、并发、缓存续读、上下文预算/折叠、溢出重试、8K/128K/1M 三档窗口、trace 回放。
- 不适用：纯函数单测（`pnpm test`）、类型/风格门禁（`pnpm check` 已覆盖）、真实模型质量评测（`pnpm eval:tools --mode=real`，非阻断）。

## 1. 标准链路（本地）

```powershell
pnpm check                          # 静态门禁：类型/lint/行数/结构/循环/MSW/ASCII/资产/surface
pnpm eval:acceptance:report         # dev 模式起 Fake Web + Next，跑 6 个场景并写报告
```

报告：`test-results/acceptance-v4.11.json`（已被 .gitignore 忽略）。
终端输出每个用例一行 `PASS/FAIL`，失败时会追加 Next 与 Fake Web 的日志尾部。

## 2. CI 等价链路（生产构建）

```powershell
pnpm build:web
node scripts/acceptance/run.mjs --mode=start --out=test-results/acceptance-v4.11.json
```

CI 默认 `GITHUB_ACTIONS=true` 时就是 `--mode=start`；本地复现 CI 失败必须用这一条，不要用 dev 模式下结论。

## 3. 常用子集

| 目的 | 命令 |
|---|---|
| 只跑一个用例 | `node scripts/acceptance/run.mjs --only=budget-8k` |
| 只跑折叠链路 | `node scripts/acceptance/run.mjs --only=fetch-fold` |
| 换端口避冲突 | `node scripts/acceptance/run.mjs --port=42351 --fixture-port=43111` |
| Web 联网 E2E | `pnpm --filter @wbfm/web exec playwright test web-network-v411` |
| 全量 Web E2E | `pnpm test:e2e` |
| Electron 联网冒烟 | `pnpm test:e2e:desktop`（重，需打包产物） |
| 工具链路评测 | `pnpm eval:tools`（mock；real 见 §6） |

## 4. 失败定位表

| 现象 | 首先检查 | 常见根因 |
|---|---|---|
| 等待 Next 服务超时 + `Could not find a production build` | `apps/web/.next` 是否存在 | 生产构建后被 `next dev` 覆盖，重新 `pnpm build:web` |
| 端口占用 / 启动即退出 | 42341、43101 是否被残留进程监听 | 上次子进程未退出；结束进程或换端口 |
| `approvals > 0` | `fetch_webpage.permission` | 权限被改回 `danger`，逐页 HITL |
| `fetch-concurrent` 请求跨度大 / 墙钟超阈值 | `packages/core/src/chat/tools/loop/parallel-batch.ts` | 并发批被关闭或上限被改 |
| `fetch-cache` `/large` 请求数 > 1 | `toolCtx.webCache` 装配 | 回合缓存被移除 |
| `budget-8k` `/large` 请求数 = 6 | `packages/core/src/tools/budget/turn-budget.ts` | 预算不随窗口缩放，硬保险丝失效 |
| `budget-1m` 出现折叠 / 结果被截断 | `resolveToolTurnLimits` 与 `enforceToolResultBudget` | 1M 生效窗口未传入 |
| `fetch-fold` 最新结果 < 10K 字符 | `resolveToolMessageBudget` / `compactWebpage` | 单条工具消息被二次截断 |
| `overflow-retry` 无「溢出缩容后完成」 | 编排器溢出重试分支 | 缩容重试被移除 |

定位原则：先看用例失败原因（`failedReasons`）→ 再看报告里的 `meta`/日志尾部 → 最后才读代码；不要用「多跑几次」掩盖确定性失败。

## 5. trace 回放（把真实失败变用例）

```powershell
# 1. 从真实会话生成场景（服务可访问 /api/conversations/:id/messages）
node scripts/acceptance/trace-to-scenario.mjs `
  --base-url=http://127.0.0.1:3200 --conversation-id=<id> --name=trace-xxx

# 2. 回放
node scripts/acceptance/run.mjs --replay=tests/scenarios/trace-replay.json --only=trace-xxx
```

约束：只支持只读工具；trace 含 write/danger 工具会被拒绝（离线无人确认）。摘要被裁剪（`…`）时也会拒绝生成，需手工补参数。

## 6. 评测（非阻断）

```powershell
pnpm eval:tools                     # mock 必跑，CI 已接入
node scripts/eval/tool-eval.mjs --mode=real --base-url=http://127.0.0.1:3200 --assistant-id=<id>
```

real 模式只断言「包含期望工具 + ≥1 条工具结果 + 零确认」，不做精确序列；不要把它当阻断门禁。

## 7. 报告模板

```markdown
## 验收结论

- 命令：`pnpm eval:acceptance:report`（dev）/ `--mode=start`（CI 等价）
- 结果：6/6 通过（或 N/M）
- 报告：`test-results/acceptance-v4.11.json`
- 门禁：`pnpm check` 通过 / 失败项

## 失败明细（如有）

| 用例 | 失败断言 | 实际 | 首要定位 |
|---|---|---|---|
| budget-8k | /large 请求数 3 | 6 | turn-budget.ts 窗口缩放 |

## 结论

可发布 / 需修复后重跑；附反向验证记录（临时回退修复后对应用例必须失败）。
```

## 8. 硬性边界

- 不改断言来让用例变绿；断言不成立先证明是实现回退还是断言写错。
- 不用 AI 断言替代确定性断言（次数、顺序、跨度、探针条数）。
- 不在 PR 门禁跑真实模型；real 评测只做夜间/手动趋势。
- 报告只写可核实数据，不写「感觉更快/更稳」。

## 9. AI 断言边界（v4.11 P2-4）

| 场景 | 允许的判定 | 是否阻断 |
|---|---|---|
| 视觉差异、布局美观、文案语气 | Midscene `aiAssert` / LLM rubric / 截图对比 | 否，只出报告 |
| 工具次数/顺序、确认次数、预算折叠、探针条数、网络请求数 | 确定性断言（本 Skill 第 1–5 节） | 是 |
| 回答是否有依据、是否答非所问 | promptfoo `llm-rubric`（夜间小样本） | 否 |

铁律：能在无模型凭据的环境里确定性判定的，一律不用 AI 断言；AI 断言只补充「看起来对不对」，不替代「系统做了什么」。Playwright MCP / Midscene 巡检按需手动执行，不接入 PR 门禁。
