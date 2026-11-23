# v4.23 任务清单

> 状态：进行中（M0 已冻结，2026-11-23）
> 规格：[spec.md](./spec.md) · 契约：[contracts.md](./contracts.md) · 选题：[README.md](./README.md)
> 原则：默认关闭；零迁移；风险节点不自动重放

## M0 契约冻结

- [x] M0.1 checkpoint 结构与重建来源
- [x] M0.2 启动恢复安全矩阵与原因码
- [x] M0.3 重试/超时策略字段与默认值
- [x] M0.4 幂等边界与副作用约束
- [x] M0.5 事件字段、零迁移与回退决策

## M1 checkpoint 重建

- [ ] M1.1 `flow/queue/checkpoint.ts`：读取运行与节点执行记录，重建 `FlowCheckpoint`
- [ ] M1.2 引擎支持 `checkpoint`：预置 state/scope/liveEdges，静默跳过已落定节点
- [ ] M1.3 `run-store` 预加载 nodeId → executionId 映射，续跑不产生重复行
- [ ] M1.4 单测：succeeded / skipped / condition 三类重建形态

## M2 启动恢复

- [ ] M2.1 `flow/queue/resume-policy.ts`：安全矩阵与原因码
- [ ] M2.2 恢复扫描分流：可续跑 → `interrupted → queued` 并入队；风险 → 保持 interrupted
- [ ] M2.3 续跑传入 checkpoint 与 `resumeReason`
- [ ] M2.4 集成测试：模拟重启后续跑、写工具在途保持 interrupted

## M3 重试与超时

- [ ] M3.1 图保存校验：`config.retry` / `config.timeoutMs` 边界
- [ ] M3.2 串行与并行路径统一重试执行器（次数、指数退避、可重试判定）
- [ ] M3.3 非交互节点超时；交互节点忽略
- [ ] M3.4 单测：重试次数、退避序列、不可重试错误、超时与忽略

## M4 观测与体验

- [ ] M4.1 `run_started.resumed` / `resumeReason`
- [ ] M4.2 `node_started.attempt` 与 `node_failed.attempt`
- [ ] M4.3 运行详情只读展示：续跑标记与重试次数（最小改动）

## M5 验证

- [ ] M5.1 定向单测全绿
- [ ] M5.2 重启续跑集成测试通过
- [ ] M5.3 `pnpm check` 与 `pnpm verify:local` 全绿

## M6 收口

- [ ] M6.1 版本总结、发行说明与博客
- [ ] M6.2 路线图与索引更新
- [ ] M6.3 版本号 4.23.0、合并 main、安装包、tag 与 Release

## 可顺延项

- 定时 / webhook / 文件监听触发
- 跨版本运行迁移
- 失败节点批量重放与补偿队列
- 分布式执行
