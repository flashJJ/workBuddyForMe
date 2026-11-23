# v4.24 联动缺陷修复 Tasks

> 依据：`docs/plan/v4.24/fix/spec.md`
> 顺序：T1 → T2 → T3 → T4 → T5 → T6

## T1 保留 `parallelism`（F1）

- [x] `apps/web/src/features/flow-editor/canvas/graph-utils.ts`
  - `fromDomain` 返回值增加 `parallelism: graph.parallelism ?? 1`
  - `toDomain(nodes, edges, viewport?, parallelism?)`，仅 `>1` 写入 `parallelism`
- [x] `apps/web/src/features/flow-editor/base/flow-editor.tsx`
  - 新增 `parallelism` state
  - 加载 effect / `emptyCanvas()` 分支赋值
  - `buildGraph` 传入 `parallelism`
- [x] 新增 `apps/web/src/features/flow-editor/canvas/graph-utils.test.ts`
  - `fromDomain` 读取 `parallelism`
  - `toDomain` 保留 `parallelism=3`
  - `parallelism=1` 或缺省不写键
- 验收：加载 → 保存后新版本图保留并发度；缺省图字节不变

## T2 定时触发接入无人值守安全门（F2）

- [x] `packages/core/src/flow/run/run-options.ts`
  - `trigger === 'schedule'` 注入 `unattendedPolicy = { mode: 'deny_all' }`
  - `api | mcp` 保持端点策略快照
- [x] `packages/core/src/flow/engine/engine-node.ts`
  - `unattended` 判定增加 `'schedule'`
- [x] `packages/core/src/flow/engine/engine-agent.ts`
  - `unattended` 判定增加 `'schedule'`
- [x] core 单测
  - schedule + 写工具 → 拒绝且流程继续
  - schedule + 只读工具 → 执行
  - schedule + agent + desktop → 抛 `desktop_control_banned`
  - manual / api / mcp 既有用例保持通过
- 验收：定时运行写工具不再被全局权限放行

## T3 调度器生命周期（F3）

- [x] `apps/web/src/lib/server/flows/flow-schedule-wiring.ts`
  - `start` 缺省值改为 `params.start ?? process.env.NODE_ENV !== 'test'`
- [x] `apps/web/src/app/api/testing/reset/route.ts`
  - `stopServerScheduler()` 后调用 `services.flowSchedules.scheduler.dispose()`
- 验收：测试环境不启动定时器；E2E 重置后无残留 tick 报错

## T4 定向验证

- [x] `pnpm --filter @wbfm/core test`
- [x] `pnpm --filter @wbfm/web test`
- [x] 确认 `engine*.test.ts`、`schedule*.test.ts`、迁移版本断言全绿

## T4.5 第二轮补充修复（F4 / F5）

- [x] `use-flows-helpers.ts` 去重键加入 attempt；新增 `use-flows-helpers.test.ts`
- [x] `workflow-run-repo.ts` 新增 `clearWaitingHuman(id, nodeId)`（节点匹配、幂等）
- [x] `run-store.ts` 在节点落定时清挂起；`run-service.ts` 审批通过时立即清挂起
- [x] 单测：database 状态机、core 人工节点批准后回到 running
- 验收：重试事件可见；审批后写操作在途崩溃不会误判为纯等待

## T5 全量门禁

- [x] `pnpm check`
- [x] `pnpm verify:local`
- [x] 检查单文件 ≤300 行、目录文件数、循环依赖、ASCII 框图等门禁

## T6 收尾

- [x] `git diff` 复核，确认无无关改动
- [x] 按 F1 / F2 / F3 三个提交收敛
- [x] 汇总修复报告（问题、影响、修复、验证结果）
- [ ] 发版（如需）另行确认版本号与发布流程
