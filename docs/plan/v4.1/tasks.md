# v4.1 Tasks

> 状态：待批准。批准后按 M0 → M4 顺序执行；每完成一项回填 [progress-log.md](./progress-log.md)。

## M0 方案与归档

- [x] T0.1 方案/规格/任务落盘：`docs/plan/v4.1/README.md`、`spec.md`、`tasks.md`、`progress-log.md`
- [x] T0.2 `git mv docs/roadmap/candidates/07-companion-eval-harness.md docs/roadmap/scheduled/v4.1-07-companion-eval-harness.md`
- [x] T0.3 `git mv docs/roadmap/candidates/11-perf-budget-and-longrun-gate.md docs/roadmap/scheduled/v4.1-11-perf-budget-and-longrun-gate.md`
- [x] T0.4 更新 `docs/roadmap/candidates/README.md`：07/11 移出候选表并注明已排期
- [x] T0.5 更新 `docs/roadmap/scheduled/README.md`：新增 v4.1-07 / v4.1-11 两行
- [x] T0.6 更新 `docs/roadmap/README.md`：新增 v4.1 进行中区块与序列行
- [x] T0.7 提交 `docs(v4.1): 方案、spec 与候选转正`

## M1 打分契约下沉与历史扩展

- [x] T1.1 新增 `packages/shared/src/script/{types,score,select,index}.ts`，逻辑原样迁移
- [x] T1.2 `scoreCandidate` / 排序函数增加可选 `weights` 末参，默认 `DECISION_WEIGHTS`
- [x] T1.3 `packages/shared/package.json` 增加 `./script` 导出；`src/index.ts` 增加导出
- [x] T1.4 web `utility/types.ts`、`score.ts`、`select.ts` 改为 re-export；`index.ts`/`trigger.ts` 不动
- [x] T1.5 `PET_SCRIPT_DECISION_LIMITS.maxStored` 20 → 50；i18n 提示同步（中英）
- [x] T1.6 新增 shared 打分测试；跑 web Utility 现有测试零改动通过
- [x] T1.7 提交 `feat(v4.1): 打分契约下沉 shared 与决策历史扩展`

## M2 评测纯函数、脚本与质量卡

- [x] T2.1 新增 `packages/shared/src/script/eval/{types,matrix,replay,metrics}.ts`
- [x] T2.2 新增 eval 测试：12 组矩阵确定性、权重换位、回放差值、指标统计
- [x] T2.3 新增 `scripts/eval/companion-report.mjs` 与 `companion-fixtures.json`
- [x] T2.4 根 `package.json` 增加 `eval:companion`
- [x] T2.5 新增 `api/pet/script/quality/route.ts`；`generation/server.ts` 增加 `quality()`
- [x] T2.6 新增 `settings/script/script-quality.tsx` + 测试；挂载到 `script-schedule-panel.tsx`
- [x] T2.7 新增 i18n `settings.script.quality.*`（中英）
- [x] T2.8 本地跑 `pnpm eval:companion -- --db=<本地库>` 生成报告
- [x] T2.9 提交 `feat(v4.1): 陪伴质量回放、场景矩阵与设置页质量卡`

## M3 性能采样与短跑门禁

- [ ] T3.1 `pet-longrun.mjs` 增加 p50、长任务、GPU 资源计数与 `--summary-out`
- [ ] T3.2 新增 `scripts/perf/perf-budget.mjs`（场景时间线、基线读写、阈值门禁）
- [ ] T3.3 新增 `apps/web/src/app/perf-nav-debug.tsx` 并在根布局挂载
- [ ] T3.4 根 `package.json` 增加 `check:perf`、`perf:baseline`
- [ ] T3.5 3 分钟冒烟：先 `--write-baseline`，再复跑 PASS；失败时记录残留
- [ ] T3.6 提交 `feat(v4.1): 性能长跑采样增强与相对基线门禁`

## M4 收尾

- [ ] T4.1 运行 `pnpm check` 与全量测试，修复门禁问题
- [ ] T4.2 归档 `docs/perf/baseline-v4.1.json`；记录硬件与模型口径
- [ ] T4.3 回填 progress-log 状态表、决策日志与工作日志
- [ ] T4.4 提交 `docs(v4.1): 质量门禁收尾与基线归档`
- [ ] T4.5 人工待办：4h 长跑（`pet-longrun --duration-min 240 --summary-out docs/perf/v4.1-longrun.json`）
