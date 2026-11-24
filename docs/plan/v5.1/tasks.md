# v5.1 任务：会设防

> 状态：📐 M0 草案（待评审）
> 关联：[选题](./README.md) · [规格](./spec.md) · [契约](./contracts.md)
> 约定：每个任务完成即勾选；每个里程碑结束跑对应定向测试，不跑本地构建（构建交给 CI）。

## M1 shared：常量、schema、错误码

- [x] `constants/tools.ts` v5.1 区块：6 个常量与默认值
- [x] `schemas/flow/file-guard/`：动作枚举、快照视图、回滚请求/结果、设置 schema
- [x] `schemas/ops/audit.ts`：追加 5 个审计事件 kind
- [x] `errors/error-codes.ts`：追加 7 个文件安全错误码
- [x] 单测：schema 边界（根数量、路径数量、默认 dryRun）、常量引用一致性
- [x] 导出：`schemas/index.ts`、`types/index.ts`

验收：`pnpm --filter @wbfm/shared test` 通过；schema 与常量无重复字面量（repo-invariants）。

## M2 database：v058 与快照仓储

- [x] 迁移 `v058-file-snapshots.ts`（纯加法，`LATEST_SCHEMA_VERSION` 57 → 58）
- [x] 迁移测试：升级后表/索引存在、断言版本 58、旧库回滚不受影响
- [x] `repositories/workspace/file-snapshot-repo.ts`：create / listByRun / getUsage / deleteBefore / deleteByRun / listReferencedBlobs
- [x] 仓储测试：按运行/节点过滤、排序、级联删除、批清理、引用计数
- [x] `repositories/index.ts` 导出子域 barrel

验收：`pnpm --filter @wbfm/database test` 通过；`EXPLAIN QUERY PLAN` 断言 `run_id` 查询走索引。

## M3 core：守卫、快照、回滚

- [x] `workspace/file-guard.ts`：根列表、系统目录拒绝、`..`/符号链接/大小写/UNC/盘根规范化
- [x] 守卫测试：越界矩阵、误配根仍拒绝、根被移除后回滚 `path_not_allowed`
- [x] `workspace/snapshot-service.ts`：beforeWrite/beforeDelete/beforeMove、afterWrite、内容寻址 blob、原子写
- [x] 快照测试：新建/覆盖/删除/移动、超大文件（人工 vs 无人值守）、配额与清理、去重
- [x] `workspace/rollback-service.ts`：按运行倒序、同路径去重、冲突检测、强制覆盖、部分失败
- [x] 回滚测试：恢复内容、删除新建、move 还原、哈希冲突、blob 缺失、路径不再授权
- [x] 契约测试：tools 目录直接写盘必须接入 FileGuard（artifact_write/spill 例外；当前无通用文件工具）

验收：core 定向测试通过；`pnpm audit:patterns` 无新增；reliability 变异得分不下降。

## M4 web：API 与 UI

- [x] `GET/PUT /api/workspace/roots` + 路由测试（校验、上限、审计）
- [x] `GET/PUT /api/workspace/snapshot-settings`（开关、单文件上限、配额、保留天数）
- [x] `GET /api/flow-runs/[id]/snapshots` + 路由测试（空列表、节点过滤）
- [x] `POST /api/flow-runs/[id]/rollback` + 路由测试（dryRun、冲突 409、部分失败）
- [x] `GET/POST /api/flow-runs/snapshots/cleanup` + 路由测试
- [x] 设置页：授权根编辑、占用展示、清理按钮、快照开关
- [x] 运行详情：快照清单、回滚预览弹窗、冲突逐文件确认
- [x] i18n：zh-CN / en-US 文案
- [x] 前端单测：回滚面板冲突与强制回滚

验收：`pnpm --filter @wbfm/web test:unit` 通过；手工验收越界拒绝与回滚主路径。

## M5 质量收口

- [ ] `pnpm selftest` 增加「越界拒绝 + 回滚 dry-run」场景并保持 ≤5 分钟
- [ ] `transition(state,event)` 纯函数 + fast-check 属性测试（补偿状态机）
- [ ] 真库矩阵：`EXPLAIN QUERY PLAN`、迁移兼容、临时文件库 helper
- [ ] bug-registry 新增本版条目并引用回归用例
- [ ] Nightly 变异连续 2 次 ≥ 60%，把 `break` 上调到 60

验收：`pnpm check`、`pnpm selftest` 全绿；Nightly 变异达标。

## M6 发布收口

- [ ] 版本号与 `sync-version` 一致
- [ ] `version-summary.md`、发行说明、博客
- [ ] 更新 `docs/plan/README.md` 状态为已发布
- [ ] CI：`ci.yml` 全绿；安装包由 Release workflow 构建
- [ ] tag `v5.1.0` 与 Release 发布

验收：Release 产物可安装；升级后旧运行无快照时展示兼容提示。

## 依赖与顺序

| 阶段 | 依赖 | 可并行 |
|---|---|---|
| M1 | 无 | — |
| M2 | M1 常量/枚举 | M3 守卫纯函数可先用本地常量 |
| M3 | M1、M2 | M4 路由骨架可先用假服务 |
| M4 | M3 服务接口稳定 | M5 部分用例可提前写 |
| M5 | M3/M4 完成 | — |
| M6 | 全部 | — |

## 风险闸门

- 每个 PR 必须映射到 R1–R5 与至少一条验收；
- 新增文件工具未接守卫 → 契约测试直接失败；
- 快照配额/清理未完成前，不开启默认快照；
- CLI/桌面控制不得悄悄接入守卫后又宣称「全面沙箱」。
