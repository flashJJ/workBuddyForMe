# v4.3 Tasks

> 状态：规划中。每完成一项回填 [progress-log.md](./progress-log.md)。

## M0 方案与归档

- [x] T0.1 方案与任务落盘：`docs/plan/v4.3/README.md`、`tasks.md`、`progress-log.md`
- [x] T0.2 `git mv docs/roadmap/candidates/08-asset-size-budget.md docs/roadmap/scheduled/v4.3-08-asset-size-budget.md`
- [x] T0.3 更新 `docs/roadmap/candidates/README.md`：当前无未排期候选
- [x] T0.4 更新 `docs/roadmap/scheduled/README.md`：新增 v4.3-08 行
- [x] T0.5 更新 `docs/roadmap/README.md`：新增 v4.3 规划中区块与序列行
- [x] T0.6 提交 `docs(v4.3): 内容与资产收口方案与候选转正`

## M1 资产预算

- [ ] T1.1 预算表 `docs/plan/v4.3/assets-budget.md`：模型、贴图、morph、安装包
- [ ] T1.2 `scripts/assets/check-assets.mjs`：扫描模型/贴图/morph 快照并输出超限清单
- [ ] T1.3 morph 语义快照与三席回归检查
- [ ] T1.4 安装包体积对比报告（读取归档产物；无包时跳过）
- [ ] T1.5 `package.json` 增加 `check:assets`，接入 `pnpm check`
- [ ] T1.6 提交 `feat(v4.3): 资产体积预算与检查脚本`

## M2 场景包

- [ ] T2.1 `shared/schemas/capability` 增加 `scene-pack` kind 与 payload schema
- [ ] T2.2 `core/capabilities/effects/scene-pack.ts`：安装/启用/停用/升级
- [ ] T2.3 样例场景包与剧本 lint/golden
- [ ] T2.4 舞台读取内容快照并展示新场景
- [ ] T2.5 提交 `feat(v4.3): scene-pack 声明式场景包`

## M3 道具包

- [ ] T3.1 `prop-pack` kind、payload schema 与资源预算
- [ ] T3.2 安装/停用 effect 与内容快照刷新
- [ ] T3.3 路径越界、缺失资源、未声明许可的拒绝测试
- [ ] T3.4 样例道具包与舞台可见性测试
- [ ] T3.5 提交 `feat(v4.3): prop-pack 道具包与资产预算联动`

## M4 音频设备

- [ ] T4.1 AudioDirector 增加输出设备偏好与 `setOutputDevice`
- [ ] T4.2 支持 `setSinkId` 的 sink 适配与默认回退
- [ ] T4.3 设置页设备选择与 `wbfm.audio.output` 持久化
- [ ] T4.4 测试：支持、不支持、设备消失三种路径
- [ ] T4.5 提交 `feat(v4.3): 音频输出设备选择`

## M5 平台元数据

- [ ] T5.1 工具描述符统一 schema 与适配层
- [ ] T5.2 provider 能力元数据与只读展示
- [ ] T5.3 回归：工具调用与模型路由零变化
- [ ] T5.4 提交 `feat(v4.3): 工具描述符与 provider 能力元数据`

## M6 收尾

- [ ] T6.1 `pnpm check` 与全量测试
- [ ] T6.2 体积报告归档与发布说明
- [ ] T6.3 进度日志与路线图状态
- [ ] T6.4 提交 `docs(v4.3): 收尾`
