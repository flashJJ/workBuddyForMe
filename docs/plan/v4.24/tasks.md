# v4.24 任务清单

> 状态：进行中（M0 已冻结，2026-11-23）
> 规格：[spec.md](./spec.md) · 契约：[contracts.md](./contracts.md) · 选题：[README.md](./README.md)
> 原则：默认关闭；每流程一个定时；系统本地时区；错过只补一次

## M0 契约冻结

- [x] M0.1 cron 语法、OR 语义与下次时间规则
- [x] M0.2 `workflow_schedules` 表与索引
- [x] M0.3 调度器认领、单飞与补偿规则
- [x] M0.4 服务/API 契约与运行入参
- [x] M0.5 纯加法迁移与回退决策

## M1 cron 解析

- [x] M1.1 `shared/schemas/flow/schedule.ts`：解析、匹配、下次时间
- [x] M1.2 单测：通配/列表/范围/步长/dom-dow OR/非法/无解
- [x] M1.3 保存校验与错误文案

## M2 存储与服务

- [x] M2.1 迁移 v054 + 仓储实现与单测
- [x] M2.2 `workflow-schedule-repo`：到期查询、原子认领、结果记录
- [x] M2.3 `flow/schedule/schedule-service.ts`：查询/保存/删除/立即运行

## M3 调度器与 API

- [x] M3.1 `flow/schedule/scheduler.ts`：tick、单飞、补偿、错误记录
- [x] M3.2 容器接线：启动调度器、dispose 停止
- [x] M3.3 API：GET/PUT/DELETE `/api/flows/:id/schedule` 与 `run`
- [x] M3.4 集成测试：到期创建、重启补偿一次、单飞跳过、禁用不触发

## M4 UI

- [x] M4.1 工具栏「定时」入口（仅已发布可开启）
- [x] M4.2 定时对话框：cron、启用、下次/上次、立即运行、删除
- [x] M4.3 i18n 中英文案

## M5 验证

- [x] M5.1 定向单测与集成测试全绿
- [x] M5.2 `pnpm check` 与 `pnpm verify:local` 全绿

## M6 收口

- [ ] M6.1 版本总结、发行说明与博客
- [ ] M6.2 路线图与索引更新
- [ ] M6.3 版本号 4.24.0、合并 main、安装包、tag 与 Release

## 可顺延项

- webhook / 文件监听触发
- 一个流程多个定时
- 每定时独立时区
- 错过多轮逐次补齐
- 分布式调度互斥
