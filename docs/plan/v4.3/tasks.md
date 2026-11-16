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

- [x] T1.1 预算表 `docs/plan/v4.3/assets-budget.md`：模型、贴图、morph、安装包
- [x] T1.2 `scripts/assets/check-assets.mjs`：扫描模型/贴图/morph 快照并输出超限清单
- [x] T1.3 morph 语义快照与三席回归检查
- [x] T1.4 安装包体积对比报告（读取归档产物；无包时跳过）
- [x] T1.5 `package.json` 增加 `check:assets`，接入 `pnpm check`
- [x] T1.6 提交 `feat(v4.3): 资产体积预算与检查脚本`

## M2 场景包

> 详细规格：[spec.md](./spec.md)。目标模型为共享 `Scene`（宠物剧本），不接小剧场。

- [x] T2.1 shared：`CAPABILITY_KINDS` 增加 `scene-pack`、权限 `scene:pack`、entry `payload/scene-pack.json`；新增 `schemas/script/scene-pack.ts`（`pack.` 前缀、1–50 场、包内去重）
- [x] T2.2 core：`capabilities/effects/scene-pack.ts` 读取/校验 payload，注册 effect handler；`manifest.ts` 增加 512KB entry 上限
- [x] T2.3 样例场景包：`buildSamplePack('scene-pack')` + effect/golden 测试（空包、前缀、重复、beats 乱序拒绝）
- [x] T2.4 内容快照与舞台接线：`services/script/scene-content-service.ts`、`GET /api/scene-content`、`useSceneContent`、`pet-stage` 合并 `extraScenes`
- [x] T2.5 提交 `feat(v4.3): scene-pack 声明式场景包`

## M3 道具包

> 详细规格：[spec-m3-prop-pack.md](./spec-m3-prop-pack.md)。资源随包、以 `pack.` 前缀隔离。

- [x] T3.1 shared：`prop-pack` kind、`prop:pack` 权限、`PACKET` entry 与 payload schema；单文件 5MB / 合计 20MB 常量
- [x] T3.2 core：`prop-pack` effect 校验资源存在/路径/预算，注册 handler；entry 64KB
- [x] T3.3 拒绝测试：空包、前缀、重复 id、缺许可、缺失资源、路径越界、超大资源
- [x] T3.4 样例道具包、内容快照与资源路由；web 动态注册表接入渲染与剧本白名单
- [x] T3.5 提交 `feat(v4.3): prop-pack 道具包与资产预算联动`

## M4 音频设备

> 详细规格：[spec-m4-audio-output.md](./spec-m4-audio-output.md)。偏好由 AudioDirector 单点持有。

- [x] T4.1 AudioDirector 增加输出设备偏好、`setOutputDevice` 与快照字段
- [x] T4.2 `applySinkId` 回退工具；music / theater-bgm / sfx / voice 四个 sink 接入
- [x] T4.3 设置页「音频输出」面板与 `wbfm.audio.output` 持久化、跨窗口 storage 同步
- [x] T4.4 测试：支持、设备消失回退、不支持三条路径
- [x] T4.5 提交 `feat(v4.3): 音频输出设备选择`

## M5 平台元数据

> 详细规格：[spec-m5-platform-metadata.md](./spec-m5-platform-metadata.md)。只读元数据，不改执行与路由。

- [x] T5.1 shared `ToolDescriptor` + core 适配层；调试列表统一为 `inputSchema` / `permissions`
- [x] T5.2 provider 协议能力常量与设置页只读徽章
- [x] T5.3 回归：工具/供应商测试通过，`toToolDefinitions` 与路由零变化
- [x] T5.4 提交 `feat(v4.3): 工具描述符与 provider 能力元数据`

## M6 收尾

- [x] T6.1 `pnpm check` 与全量测试（9 包 736 文件 4180 项）
- [x] T6.2 体积报告归档与发布说明（安装包 264.88MB，校验和复核通过；最终构建含道具展示场景）
- [x] T6.3 进度日志、路线图状态、版本总结与 10 篇博客
- [x] T6.4 提交 `docs(v4.3): 发布说明、版本总结与博客`
- [x] T6.5 最终代码补跑 `pnpm check`、core 能力测试，并修正方案文档内链
- [x] T6.6 修复舞台退出恢复桌宠丢失模型；重建并复核安装包（commit `ca9d63df`）
