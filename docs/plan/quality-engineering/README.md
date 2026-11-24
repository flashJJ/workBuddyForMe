# 质量工程专项：测得准

> 类型：跨版本专题（不占用版本号，与 v5.1 并行推进）
> 状态：📐 计划草案（待评审）
> 目标：把「靠人工排查才发现」的缺陷，前移为「门禁与工具自动发现」
> 配套：[缺陷预防手册](../wiki/bug-prevention-playbook.md) · [Bug 记录表](../wiki/bug-registry.md) · [验收清单](../wiki/acceptance-checklist.md)

## 1. 先回答一个问题

**每次排查都能发现 bug，说明隐藏 bug 很多吗？**

更准确的说法是：**发现能力目前强于自动检出能力**。v5.0.1 封版后的一轮排查修复了 9 组问题（23 个文件，+449/−97），逐条看都不是「深不可测」的缺陷，而是测试没覆盖到的语义角落：

| # | v5.0.1 修复 | 本可拦住的机制 |
|---|---|---|
| 1 | 补偿重放丢 `trigger`，无人值守语义退化 | 跨层语义断言（重放参数） |
| 2 | `retrying` 重启不收敛，补偿卡死 | 状态机转换穷举 + 重启演练 |
| 3 | 中文错误关键词缺失、限流被误判 | 输入域矩阵（中英/优先级） |
| 4 | 运行列表 `workflowId` 未下推 SQL，被 limit 截断 | 真库组合查询 |
| 5 | 列表/清理读取 `graph_snapshot_json` | 投影/性能断言 |
| 6 | 保留期按 `created_at`，长跑运行刚结束就被删 | 时间边界（受控时钟） |
| 7 | 停用流程可重放、批量不去重、`missed_count` 不封顶 | 前置条件与上限边界 |
| 8 | UI 缺 `schedule/webhook/file` 筛选、HMAC 无法切回 | 交互状态用例 |
| 9 | 失败节点取第一个而非最后一个 | 多失败节点组合 |

归成五类盲区：**状态机转换、时间语义、组合条件、存储语义、交互状态**。现有 800+ 单测文件、52 个 E2E spec 覆盖面并不小，问题在「广而浅」：多数用例只走主线 happy path，且断言与实现同源。因此专项的主题不是「再多写测试」，而是**提高测试的有效性**。

## 2. 现状盘点

| 维度 | 现状 |
|---|---|
| 测试资产 | 约 839 个单测/集成文件（core 343、web 323、database 85、shared 55、desktop 40）+ 52 个 E2E spec |
| 覆盖率门禁 | core / database 70%（压缩模块 95%）；web 只卡 `lib/server`、`features/chat`、`features/voice` 三域 60% |
| 静态门禁 | `pnpm check` 10 项：typecheck、lint、300 行、结构、循环、MSW、ASCII、资产、surfaces、E2E 隔离 |
| 长链路 | CI：E2E、验收、工具评测、多智能体回归；Nightly：验收 + 工具链 + 视觉巡检 |
| 人工资产 | bug-registry 70+ 条、playbook P1–P8、验收清单 A–F |
| 缺口 | 手册给人读不可执行；时间未受控；无属性/变异测试；缺 test impact；缺陷与回归用例未强绑定 |

## 3. 目标与指标

| 指标 | 基线（v5.0.1） | 目标（3 个版本内） |
|---|---|---|
| 封版后人工排查发现的问题组数 | 9 | ≤ 2 |
| 修复提交附带回归用例 | 多数有、无强制 | 100%（脚本校验） |
| 可靠性域分支覆盖 | 待测（M1 基线） | ≥ 85% |
| 补偿状态机转换覆盖 | 主线 3–4 条 | 表内合法/非法转换 100% |
| 变异得分（reliability + 关键仓储） | 待测 | 首期 ≥ 40%，最终 ≥ 60% |
| flaky 率 / CI 时长 | < 1% / 现状 | 不升 / 增幅 ≤ 15% |
| 本地 `pnpm selftest` | 无 | ≤ 5 分钟给出结论 |

指标只用于观察趋势；硬门禁只卡「回归用例存在」「状态机转换表完整」「模式扫描无新增」。

## 4. 机制设计

### A. 失效模式门禁化（playbook → 可执行检查）

- 新增 `scripts/check-patterns.mjs`：按 P1–P8 扫描代码信号（上限字面量、无超时 fetch、`EventSource` 未 close、`spawn` 未回收、模块级单例等），输出 `file:line`；
- 基线存 `scripts/.patterns-baseline.json`，只阻止新增，不要求一次性清零；
- 纳入 `pnpm check`，与 `repo-invariants` 互补（后者管常量单一来源，前者管危险写法）。

### B. 状态机与属性测试（core/reliability）

- 把补偿推进抽成纯函数 `transition(state, event) → { state, effects }`，服务层只做 IO；
- 表驱动覆盖：`pending/retrying/recovered/exhausted/cancelled` × `sweep/claim/replay_ok/replay_fail/restart/interrupt/cancel` 的全部合法与非法组合；
- 属性测试（fast-check）：随机事件序列后校验不变式——`attempt ∈ [1,3]`、`pending ⟺ nextRetryAt ≠ null`、终态不再变更、同 rootRun 唯一、同一时刻重复 sweep 幂等；
- 模型测试：随机 `sweep/terminal/restart` 序列与内存模型逐步对比。

### C. 时间与故障注入

- 引入 `Clock`（`now()`）注入，补偿、保留、调度、健康统一使用；测试用 `ManualClock` 推进，覆盖 30s/2m/10m 退避、30/90 天保留边界、`3 × 30s` stalled 阈值；
- failpoint：在 `replayOne`、仓储写入、事务边界注入抛错或「写一半退出」，覆盖 claim 后崩溃、finish 后未推进、终态回调抛错；
- 重启演练：真实临时 SQLite 文件 + 实例 A/B——A 留下 `retrying`/`interrupted` 后关闭，B 启动 `recover()` 后断言收敛；这正是 5.0.1 漏掉的场景。

### D. 真库组合矩阵（database）

- 统一测试 helper：临时文件库 + 完整迁移；`:memory:` 仅用于纯逻辑；
- 矩阵：筛选（`workflowId/status/trigger`）× 分页 × 列投影（不读 `graph_snapshot_json`）× 级联删除 × 保留（`finished_at/created_at` 混合）；
- 对高频列表查询断言 `EXPLAIN QUERY PLAN` 不出现全表 `SCAN`；
- 迁移兼容矩阵：旧行 → 新列默认值 → 快照读取。

### E. 变异测试与变更影响

- Nightly 跑 StrykerJS（先覆盖 reliability 6 个文件 + 关键仓储），报告写 Job Summary；不阻断，达标后逐步升级为阻断；
- `scripts/test-impact.mjs`：基于 turbo 依赖图 + `git diff` 映射受影响包与测试命令，本地 pre-push 只跑子集，CI 仍全量；
- 评审清单增加「关键分支不能只断言 mock 被调用」，避免同源假测试。

### F. 缺陷闭环与自测 CLI

- bug-registry 每条必须引用存在的回归测试文件；`scripts/check-bug-regression.mjs` 校验引用有效性；
- 新缺陷模板增加一栏「若自动化没拦住，缺的是哪类机制（A–E）」，反向驱动机制建设；
- `pnpm selftest`：临时数据根 → 迁移 → 启动 mock 容器 → 跑核心场景（补偿重启恢复、HMAC 验签、保留 dry-run、批量重放、调度 missed）→ 输出 PASS/FAIL 与定位提示；供提交前与发布前使用；
- 配套命令：`pnpm test:impact`、`pnpm mutate:reliability`、`pnpm audit:patterns`。

## 5. 里程碑

| 里程碑 | 交付 | 验收 |
|---|---|---|
| M1 基线 | 各模块覆盖率/变异基线、flaky 统计、9 条 v5.0.1 缺陷的机制归类 | 报告可复现，热点文件排序明确 |
| M2 状态机底座 | `Clock` 注入、`transition` 纯函数、表驱动 + 属性测试、failpoint | 转换表 100%，随机序列 1000 次不变式成立 |
| M3 真库与回归补齐 | 仓储矩阵、重启演练、9 条缺陷回归用例 | 5.0.1 每条修复都有对应测试，真库可复现原缺陷 |
| M4 工具链 | `selftest`、`check-patterns`、`test-impact`、Nightly 变异 | 本地 5 分钟出结论；门禁接入 `pnpm check` |
| M5 门禁调优 | 阈值调整、CI 预算复盘、季度巡检流程 | CI 增幅 ≤ 15%，无新增 flaky |

## 6. 与版本节奏的关系

- 本专项不占版本号；M1–M2 与 v5.1 并行，M3–M4 在 v5.1 封版前完成，M5 在下一版本启动前复盘；
- 若 v5.1 做 OS 级沙箱，本专项是其质量前置：沙箱边界更需要 failpoint 与重启演练；
- 不改变现有验收清单与发布流程，只在其中增加「`pnpm selftest` 通过」一项。

## 7. 风险与取舍

| 风险 | 对策 |
|---|---|
| 变异测试慢、噪声大 | 仅 Nightly + 热点文件，阈值渐进，不阻断初期 |
| 属性测试不稳定 | 固定 seed，失败打印 shrink 序列并入 bug-registry |
| 测试时长增长 | 分层执行：本地影响面、CI 全量、Nightly 重负载 |
| 指标驱动造假 | 覆盖率只观察，硬门禁只卡「回归用例存在」与「转换表完整」 |
| 维护成本 | 复用现有 in-memory DB、E2E reset、验收脚本，不新建框架 |

## 8. Non-Goals

- 不追求 100% 覆盖率，不为指标写无断言测试；
- 不重写 E2E，不引入云真机/设备农场；
- 不替代人工验收清单（A–F）与真机体验；
- 不做分布式混沌平台，只在进程内与重启边界注入。

## 9. 立即可做的三件事

1. 把 v5.0.1 的 9 条修复逐条补成回归用例（优先真实文件库的重启恢复）；
2. 给补偿服务加 `Clock` 与 `transition` 表，先写测试再改实现；
3. 落地 `pnpm selftest` 最小版（3 个场景）+ `check-patterns` 初版基线。

## 10. 实施进度

> 本地约束：磁盘紧张，不再每次本地构建；验证只用定向 `vitest`/静态检查，构建交给 CI。

| 日期 | 里程碑 | 完成内容 | 验证 |
|---|---|---|---|
| 2026-11-24 | M1 | 可靠性域基线：语句 89% → 95.66%，分支 73.07% → 79.69%；补偿服务 81.22/63.15 → 100/83.33 | 临时目录 coverage（已清理），无构建产物 |
| 2026-11-24 | M2 | 新增 `compensation-service.matrix.test.ts`（6 用例）：30s/2m/10m 退避阶梯、重复/错位终态、sweep 边界（停用/超限/重放抛错）、根运行缺失回退、recover 8 状态矩阵、lastRun 缺失 | 6/6 通过 |
| 2026-11-24 | M3 | 新增 `workflow-run-repo.test.ts`（5 用例）：`workflowId` 下推 SQL、组合过滤、列投影、`finished_at` 回退、每流程上限 | 5/5 通过 |
| 2026-11-24 | A | `repo-invariants` 增 3 条静态不变量：触发器筛选覆盖 `FLOW_TRIGGERS`、可靠性服务禁 `Date.now()`、`EventSource` 同文件必须 `close` | 8/8 通过 |
| 2026-11-24 | F | 新增 `scripts/check-bug-regression.mjs` 并接入 `pnpm check`：校验 bug-registry 引用的测试文件存在（当前 14/71 条有引用） | 脚本通过 |
| 2026-11-24 | M4 | `pnpm selftest` 最小版：`selftest-scenarios.test.ts` + `scripts/selftest.mjs`，真实文件库跑补偿重启恢复、能力包验签、保留 dry-run，按场景输出 PASS/FAIL | 3/3 通过 |
| 2026-11-24 | A | 新增 `scripts/check-patterns.mjs`（P1/P2/P3/P6/P7/P8 代码信号）与 `.patterns-baseline.json`，只阻止新增；接入 `pnpm check`（`pnpm audit:patterns`） | 75 处历史命中入基线，门禁通过 |
| 2026-11-24 | E | 新增 `scripts/test-impact.mjs`（`pnpm test:impact`）：git diff + 未跟踪文件 → 工作区包 → 反向依赖扩散，输出最小测试命令；无新增依赖 | 本次 23 个改动文件映射出 8 个包与 `pnpm check` |
| 2026-11-24 | M3 | 新增运行详情路由用例：两个失败节点 + 当前生产图只删其一，锁定 `failedNodeId` 取最后一个（删最后 → `node_removed`；删第一 → 仍可续跑） | 2/2 通过 |
| 2026-11-24 | E | 接入 Nightly 变异测试：StrykerJS 10.1.1 + vitest runner，只覆盖 reliability 6 个文件；Nightly 非阻断并写 Job Summary；新增 `mutation-summary.mjs` 与报告上传 | `--dryRunOnly` 通过（611 变异体 / 36 用例）；依赖净增约 10MB，沙箱自动清理 |
| 2026-11-24 | C | 新增 `compensation-service.failpoint.test.ts`（2 用例）：claim 后崩溃由 `recover()` 回到 pending；`markRetrying` 写库失败收敛为 exhausted，不残留 retrying | 2/2 通过 |
| 2026-11-24 | F | bug-registry 补 v5.0.1 九条（B-72…B-80）并引用回归文件 | 引用覆盖 14/71 → 23/80，`check:bug-regression` 通过 |

**下一步**：

1. 观察首份 Nightly 变异报告（run `45378061165`）的得分，再调整 `stryker.config.mjs` 阈值与范围；
2. 状态机底座剩余：`transition(state,event)` 纯函数 + fast-check 属性测试；
3. 真库矩阵扩展：`EXPLAIN QUERY PLAN` 断言、迁移兼容矩阵、统一临时文件库 helper；
4. M5 流程收口：验收清单/发布流程加入「`pnpm selftest` 通过」。
