# v5.0 任务：会兜底

> 规格：[spec.md](./spec.md) · 契约：[contracts.md](./contracts.md)
> 约定：每完成一项勾选；迁移版本断言统一 57；单文件 ≤300 行；每个 PR 必须映射到 R1–R3/S1–S2 与至少一条验收。

## M0 范围冻结与文档

- [x] M0.1 冻结 v5.0 范围为 R1 补偿/批量重放、R2 运行快照/跨版本续跑、R3 运行治理/触发器健康、S1 Agent 写工具门控、S2 Webhook HMAC
- [x] M0.2 重写 `docs/plan/v5.0/README.md`（一句话、为什么现在、借鉴、范围、路径、里程碑、风险、验收）
- [x] M0.3 创建 `docs/plan/v5.0/spec.md`（设计原则、现状、架构、v057、四条链路、测试、非目标、决策）
- [x] M0.4 创建 `docs/plan/v5.0/contracts.md`（类型、schema、DB、仓储、服务、API、错误码、上限、语义、审计）
- [x] M0.5 创建 `docs/plan/v5.0/tasks.md`（M0–M8）
- [x] M0.6 更新 `docs/plan/README.md` v5 区（M0 范围冻结 + spec/contracts/tasks 链接）
- [x] M0.7 更新 `docs/roadmap/README.md` v5.0 行（状态与链接）
- [x] M0.8 更新 `backlog-inventory.md` 处置（M-1/M-2/M-3、S-2/S-3/S-4/S-5/S-6 → v5.0；D-7 → v5.1）
- [x] M0.9 更新 `theme-shortlist.md` 状态（范围已冻结）
- [ ] M0.10 评审通过后进 M1；不提前写实现代码

## M1 shared 契约

- [x] M1.1 `types/flow.ts`：`FlowRunError` 扩展、`WorkflowRunView.graphHash/replayBatchId`、`FlowRunVersionCheck`、补偿/批量/健康类型、定时 `missedCount/lastMissedAt`
- [x] M1.2 `schemas/flow/run-reliability.ts`：批量/重放/清理/保留/鉴权 schema 与常量
- [x] M1.3 `schemas/flow/index.ts` / `types/index.ts` 导出
- [x] M1.4 `failure-classifier` 纯函数与表驱动单测（9 类 + 关键词 + 节点兜底）
- [x] M1.5 canonical JSON 与哈希 helper + 稳定性单测
- [x] M1.6 批量上限、保留边界、重放 mode schema 单测

## M2 database v057

- [x] M2.1 迁移 `v057-run-reliability.ts`：运行三列 + 补偿表 + 定时两列 + 触发器 cipher 列 + 索引
- [x] M2.2 注册迁移，`LATEST_SCHEMA_VERSION = 57`
- [x] M2.3 `workflow-run-repo`：快照读写、批次 id、终态分页/每流程超出/批量删除
- [x] M2.4 新仓储 `flow-run-compensation-repo`：create/claim/状态推进/计数/按流程列出
- [x] M2.5 `workflow-schedule-repo.recordMissed`；`workflow-trigger-repo.setSecret/getSecretCipher`
- [x] M2.6 `v057-run-reliability.test.ts`：列/表/索引、旧行兼容、默认值
- [x] M2.7 全仓迁移断言 56→57；`v056` 测试改为只迁移到 56

## M3 运行快照与跨版本续跑

- [x] M3.1 `run-snapshot.ts`：serialize/parse/load/diff
- [x] M3.2 `run-service.createRun` 写快照与哈希；新增内部 `createRunFromGraph` 供重放固定图/版本
- [x] M3.3 `run-service` 执行/续跑改用 `loadRunGraph`，禁止静默用最新生产图
- [x] M3.4 图不可用 → `interrupted` + `flow/run-graph-unavailable`
- [x] M3.5 单条重放增加 `mode='snapshot'|'latest'`；latest 节点缺失 409
- [x] M3.6 运行详情 API 附带 `versionCheck`
- [x] M3.7 测试：快照优先、精确版本回退、缺失阻断、版本差异、latest 节点缺失

## M4 补偿队列与批量重放

- [x] M4.1 `compensation-service`：onRunTerminal/sweep/状态机/单飞顺延/流程停用取消
- [x] M4.2 补偿 timer：启动一次 + 60s tick；审计 scheduled/exhausted
- [x] M4.3 `run-replay-service`：replayOne/replayBatch、去重、≤20、逐条 try/catch、批次 id、不建补偿
- [x] M4.4 API：`POST /api/flow-runs/replay-batch`
- [x] M4.5 容器装配：services.flowCompensation、services.flowRunReplay
- [x] M4.6 测试：退避阶梯、3 次耗尽、busy 顺延、重启续跑、部分失败、批次 id
- [x] M4.7 回归：既有单条 replay / durable / recovery 测试

## M5 运行中心 UI

- [x] M5.1 运行中心统计卡：运行中/待处理失败/补偿中/耗尽
- [x] M5.2 失败分组与错误类别/建议展示
- [x] M5.3 多选（≤20）+ 批量重放对话框（模式/方式/结果）
- [x] M5.4 运行详情版本差异横幅与「按原版本续跑 / 按新版本重放」
- [x] M5.5 补偿状态徽标与行内说明
- [x] M5.6 hooks/endpoints：批量、健康、清理、replay mode、versionCheck
- [x] M5.7 前端纯函数单测：多选上限、结果汇总、版本提示
- [x] M5.8 i18n：`flowRuns.batch/health/version/compensation` 中英同步

## M6 运行治理与触发器健康

- [x] M6.1 `retention-service`：策略读写、时间淘汰、每流程上限、排除待处理补偿、dry-run、分批删除
- [x] M6.2 清理 timer：启动后 5 分钟 + 24h；审计 cleanup
- [x] M6.3 `runtime-health-service`：调度心跳/文件监听/补偿/定时/触发器/保留
- [x] M6.4 调度器 missed 计数：应触发次数、上限 100、last_missed_at、仍只补跑一次
- [x] M6.5 失败可发现：运行中心待处理计数 + 桌面系统通知（可选）
- [x] M6.6 API：`GET /api/flow-runs/health`、`POST /api/flow-runs/cleanup`
- [x] M6.7 设置页「运行保留」区块 + dry-run 预览
- [x] M6.8 健康抽屉 UI + 纯函数单测
- [x] M6.9 测试：保留边界、dry-run、审计、missed 计数、心跳阈值

## M7 安全边界

- [x] M7.1 Agent runner 接受可选 `toolGate`；`engine-agent` 在无人值守时注入
- [x] M7.2 拒绝写审计 `flow.agent.tool_denied`；返回结构化工具错误
- [x] M7.3 `trigger-auth`：HMAC 签名/验签、300s 窗、常量时间比较
- [x] M7.4 公开 Webhook 路由读原始 body；bearer/hmac/both 分支
- [x] M7.5 触发器 schema/服务/仓储支持 `authMode` 与 cipher
- [x] M7.6 触发器对话框「鉴权方式」+ 未轮换提示
- [x] M7.7 测试：agent 拒绝/允许、manual 不变、HMAC 合法/错误/过期/轮换/缺密文
- [x] M7.8 回归：既有 Bearer、幂等、单飞、未发布门控

## M8 门禁与发布

- [x] M8.1 `pnpm check`
- [x] M8.2 `pnpm verify:local`
- [x] M8.3 版本总结、发行说明、博客、版本号 5.0.0
- [x] M8.4 更新 `docs/plan/README.md`、`docs/roadmap/README.md`、`docs/roadmap/scheduled/README.md`
- [ ] M8.5 合并 main、tag、安装包归档与 Release
