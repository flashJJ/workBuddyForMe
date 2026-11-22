# v4.22 任务清单

> 状态：进行中（M1–M5 已实现并验证，2026-11-23）
> 规格：[spec.md](./spec.md) · 契约：[contracts.md](./contracts.md) · 选题：[README.md](./README.md)
> 原则：默认关闭；`parallelism=1` 逐字等价；零迁移

## M0 契约冻结

- [x] M0.1 Controller Pipeline 三类型、来源与优先级表
- [x] M0.2 任务上下文等价契约（五段顺序、分隔符、空结果）
- [x] M0.3 Flow 图 `parallelism` 字段与默认值
- [x] M0.4 并行语义：预算共享、幂等键、失败隔离、结果收敛
- [x] M0.5 事件兼容与迁移决策

## M1 Controller Pipeline

- [x] M1.1 `core/context/pipeline` 的 types / collector / packer 纯函数与单测
- [x] M1.2 五个内置来源（摘要 / 事实 / 计划 / 近期 / 记忆）与注册顺序
- [x] M1.3 `buildTaskContextBlock` 接入 collector + packer
- [x] M1.4 等价验证：固定夹具与 v4.21 快照逐字一致

## M2 Flow 并行调度

- [x] M2.1 图契约增加 `parallelism`（1–4，默认 1）与校验单测
- [x] M2.2 编译/引擎读取并行度并 clamp
- [x] M2.3 就绪集合调度器：并发上限、可并行类型白名单
- [x] M2.4 `parallelism=1` 走原串行路径，现有引擎测试不改断言即通过
- [x] M2.5 扇出图测试：双分支都执行、并发度不超限

## M3 并行语义

- [x] M3.1 流程级工具预算在并行分支共享，超限分支返回拒绝结果
- [x] M3.2 节点幂等键 `${runId}:${nodeId}` 与运行期 memo
- [x] M3.3 失败隔离：失败节点后代 skipped，无关分支继续
- [x] M3.4 结果收敛：多个成功 end 取拓扑序首个，其余仅事件

## M4 观测与体验

- [x] M4.1 `run_started` 增加 `parallelism`
- [x] M4.2 节点事件补齐 `durationMs`（并行下仍为自身耗时）
- [x] M4.3 画布/试运行面板对并行度只读展示（最小改动；无设置页）
- [x] M4.4 v4.21 并入项：治理动作使用观察、解释轨迹落盘评估（只评估，不默认落库）

## M5 验证

- [x] M5.1 定向单测：collector / packer / task-context 等价 / engine-parallel
- [x] M5.2 定向 E2E 或集成：扇出流程并行与失败隔离
- [x] M5.3 `pnpm check` 与 `pnpm verify:local` 全绿

## M6 收口

- [x] M6.1 全量单测、集成与定向 E2E 通过
- [x] M6.2 更新路线图、版本总结、发行说明与博客
- [x] M6.3 提交、推送、打 tag、归档安装包与 Release

## 可顺延项

- 视觉巡检 L2/L3
- 多智能体三角色并行
- 跨分支数据汇聚（需放开编译器单入边限制）
- 并行度设置页与每图可视化编辑
