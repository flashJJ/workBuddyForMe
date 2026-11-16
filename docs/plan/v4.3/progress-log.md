# v4.3 进度与决策留痕

> 用途：记录 v4.3 每次推进的「做了什么、为什么、结果、下一步」。
> 关联：[v4.3 方案](./README.md) · [Tasks](./tasks.md)。

## 当前状态

| 里程碑 | 状态 | 最近更新 |
|---|---|---|
| M0 方案与归档 | ✅ 完成（方案/tasks 落盘，候选 08 转正，三处索引已更新） | 2026-11-16 |
| M1 资产预算 | ✅ 完成（`check:assets`、3 模型 22.29MB、morph 快照、安装包 264.61MB） | 2026-11-16 |
| M2 场景包 | ✅ 完成（scene-pack kind、样例包、内容快照、桌宠 extraScenes；19 项测试通过） | 2026-11-16 |
| M3 道具包 | ✅ 完成（prop-pack、样例 GLB、内容快照、资源路由；20 项 core 测试通过） | 2026-11-16 |
| M4 音频设备 | ⏳ 待开始 | — |
| M5 平台元数据 | ⏳ 待开始 | — |
| M6 收尾 | ⏳ 待开始 | — |

## 决策日志

| 编号 | 日期 | 决策 | 原因 | 待复核 |
|---|---|---|---|---|
| D1 | 2026-11-16 | v4.3 收口剩余事项，主题定为内容与资产 | 候选与延后项已分散三个版本，继续拆版会让每条线都缺收尾 | 若 P1 超期，P1/P2 顺延 v4.4 |
| D2 | 2026-11-16 | 单模型 ≤25MB、内置三席合计 ≤25MB、安装包 ≤300MB | 以 v4.1 的 264.61MB 与实际模型 6–9MB 为基线，留出增长余量 | 首轮扫描后按真实分布微调 |
| D3 | 2026-11-16 | 场景/道具包只允许声明式 payload | 避免内容包变成任意代码入口，执行器仍由内核注册 | 若需要新动作，走 pet-action |
| D4 | 2026-11-16 | 音频设备选择只做偏好与回退 | `setSinkId` 平台差异大，不能影响启动与播放 | 真机验证后决定是否默认展示 |
| D5 | 2026-11-16 | 工具描述符/provider 元数据只读展示 | 统一字段不能改变调用与路由，否则回归面过大 | 若需要路由，另开版本 |
| D6 | 2026-11-16 | P2 音频全图/自动响度/统一队列不承诺 | 需要重构播放器生命周期，不适合与内容包同版 | v4.4 评估 |
| D7 | 2026-11-16 | 场景包复用共享 `Scene`，不接小剧场 | `Scene` 已有校验与 `extraScenes` 注入口；小剧场无动态包链路 | 若需要剧场包，另开 kind |
| D8 | 2026-11-16 | 场景 id 强制 `pack.` 前缀 | 与内置 `touch/moment/ambient/state/pool/gen` 命名空间结构性隔离 | 无 |
| D9 | 2026-11-16 | payload schema 独立到 `schemas/script/scene-pack.ts` | `capability.ts` 已接近 300 行门禁，脚本域更内聚 | 无 |
| D10 | 2026-11-16 | 跨包同 id 在聚合层 fail-closed | 与 `mergeMotionContent` 一致，避免不确定覆盖 | 冲突时停用其一 |
| D11 | 2026-11-16 | 场景包不进入 `gen.*` 主动播放轮换 | 主动播放依赖生成场景元数据，包场景只走触发与手动播放 | 需要时另加元数据 |
| D12 | 2026-11-16 | 道具资源随包放 `payload/`，经 `/api/prop-assets` 流式读取 | 不写 `public/`，安装/卸载不污染构建产物 | 无 |
| D13 | 2026-11-16 | 道具 id 强制 `pack.` 前缀，许可必填 | 与内置 8 个道具隔离；缺少许可直接拒绝 | 无 |
| D14 | 2026-11-16 | 单文件 5MB、合计 20MB、entry 64KB | 道具远小于模型，防止包内塞大资产 | 按真实使用再调 |
| D15 | 2026-11-16 | 运行时注册表用 getter，不重建渲染 session | 内容到达晚于 controller 创建；已挂载道具不热替换 | 无 |

## 工作日志

### 2026-11-16 M0 方案与归档

- 新增 `docs/plan/v4.3/README.md`：P0 资产预算 + 场景包/道具包；P1 设备选择 + 工具描述符 + provider 元数据；P2 音频全图等。
- 新增 `tasks.md` 与 `progress-log.md`。
- 候选 08 转为 `docs/roadmap/scheduled/v4.3-08-asset-size-budget.md`。
- 三处索引已更新；当前无未排期候选。

### 2026-11-16 M1 资产预算

- 新增 `scripts/assets/check-assets.mjs` 与 `lib/{glb,image-size}.mjs`：扫描 VRM/GLB 体积、贴图格式与尺寸、morph 有序签名、骨骼数与归档安装包。
- 预算表：单模型 25MB、内置合计 25MB、安装包 300MB；贴图硬上限 4096，目标颜色 2048 / 数据 1024，目标格式 WebP。
- 新增 `scripts/assets/asset-budget.json` 与 `morph-snapshots.json`；`package.json` 增加 `check:assets` 并接入 `pnpm check`。
- 扫描结果：3 个模型合计 22.29MB；150 张贴图；13 条警告（3 张 4096 颜色贴图、10 张 PNG/JPEG 未转 WebP）；安装包最新 v4.1.0 264.61MB。
- 验证：`pnpm check:assets` PASS；`pnpm check:family` 三席 49 骨骼 / 118 morph / 18 binds 全过；`pnpm check` 全绿。
- 说明：本里程碑只扫描与设门槛，不自动压缩、不重排 morph。

### 2026-11-16 M2 场景包

- 规格：新增 `spec.md`，确定场景包复用共享 `Scene`，不接小剧场；场景 id 强制 `pack.` 前缀。
- shared：`CAPABILITY_KINDS` 增加 `scene-pack`，权限 `scene:pack`，entry `payload/scene-pack.json`；新增 `schemas/script/scene-pack.ts`（1–50 场、包内去重、前缀校验）。
- core：新增 `effects/scene-pack.ts` 与 handler；entry 上限 512KB；新增 `services/script/scene-content-service.ts` 聚合已启用包，版本为 `packs:<sha256>`。
- 样例：`buildSamplePack('scene-pack')` 生成 `pack.sample.raised-greeting`（`touch::raised::tap`），覆盖表情、手势、语音与恢复。
- web：新增 `GET /api/scene-content`、`useSceneContent`；`useScriptDirector` 新增 `packScenes`，与生成场景一起校验后进入触发索引；主动播放轮换仍只用生成场景。
- 测试：新增 effect 与内容快照测试，样例包安装/停用/启停/卸载链路通过；`pnpm check` 全绿。
- 说明：小剧场 `/stage` 与既有能力包行为零变化；安装/停用后下一次挂载生效，不做热替换。

### 2026-11-16 M3 道具包

- 规格：新增 `spec-m3-prop-pack.md`；资源随包放 `payload/`，id 强制 `pack.` 前缀。
- shared：新增 `schemas/prop/prop-pack.ts`，定义 kind / 许可 / 几何参数与 5MB、20MB 预算常量；能力包增加 `prop-pack`、`prop:pack`、`payload/prop-pack.json`。
- core：新增 `effects/prop-pack/` 读取与资源校验（存在、路径、单文件/合计预算）；entry 上限 64KB；新增 `services/media/prop-content/` 聚合已启用包并只读 payload 声明资源。
- 样例：`buildSamplePack('prop-pack')` 内含程序化生成的 1KB 立方体 GLB（`pack.sample.cube`），已用 three GLTFLoader 验证可加载。
- web：新增 `GET /api/prop-content` 与 `GET /api/prop-assets?pack=&file=`；`usePropContent` 合并内置 + 包内道具；`VrmPropLayer` / `VrmCueAdapter` / 剧本校验共用动态注册表，内容到达无需重建 session。
- 验证：core 能力 70 项、web 渲染/适配/导演 32 项全部通过；`pnpm check` 全绿。
- 说明：已挂载道具不热替换；停用后下一次挂载或下一次 cue 生效。

