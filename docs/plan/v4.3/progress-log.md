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
| M4 音频设备 | ✅ 完成（输出设备偏好、四 sink 接入、设置面板；160 项相关测试通过） | 2026-11-16 |
| M5 平台元数据 | ✅ 完成（ToolDescriptor 适配、provider 协议能力徽章；184+5 项测试通过） | 2026-11-16 |
| M6 收尾 | 🧪 测试/门禁/安装包/文档完成；待真机验证后合并与 tag | 2026-11-16 |

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
| D16 | 2026-11-16 | 输出设备偏好由 AudioDirector 单点持有，`null` = 默认 | 与 mute/duck 同源，sink 只执行不决策 | 无 |
| D17 | 2026-11-16 | `applySinkId` 首次失败后回退 `''` | 覆盖设备拔出/权限变化，保证仍有声音 | 无 |
| D18 | 2026-11-16 | 设置面板才枚举设备，并监听 `devicechange` | 枚举需要权限/手势，不在桌宠启动路径调用 | 无 |
| D19 | 2026-11-16 | 语音 sink 的 `setGain` 保持 no-op | 既有行为是 BGM 静音不影响语音，只加设备路由 | 无 |
| D20 | 2026-11-16 | 工具描述符统一为 name/description/inputSchema/source/permissions/readOnly/alwaysConfirm | 消除 parameters/permission 两套命名；执行侧不改 | 无 |
| D21 | 2026-11-16 | 调试列表纳入已发布流程工具 | `resolveTool` 已支持 flow；只读列表补齐来源 | 无 |
| D22 | 2026-11-16 | provider 能力按协议静态声明，不落库不路由 | 避免迁移与行为变化，只做只读展示 | 后续需要按模型声明时再扩展 |

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

### 2026-11-16 M4 音频输出设备

- 规格：新增 `spec-m4-audio-output.md`；设备偏好单点放在 AudioDirector，`null` 表示系统默认。
- audio：新增 `output-device.ts`（`applySinkId` 首次失败回退默认、偏好读写与归一化）；导演快照增加 `outputDevice`，注册 sink 即应用，切换广播，并监听 `storage` 跨窗口同步。
- sinks：music 用 HTMLAudioElement、theater-bgm 保存偏好并在元素创建后应用、theater-sfx 在 AudioContext 创建时读取导演偏好、voice 的 WebAudioPlayer 增加设备切换；四者均不支持时静默。
- 设置：新增 `useAudioOutputDevices`（枚举 `audiooutput` + `devicechange` 刷新）与「音频输出」面板，注册到语音分组；新增 `audio` i18n 命名空间。
- 测试：`applySinkId` 支持/回退/不支持、导演注册与广播、设备枚举有/无 `mediaDevices`；audio + theater + voice + music + settings 共 160 项通过。
- 验证：`pnpm check` 全绿。
- 说明：设备切换不重建播放器；切换失败时 sink 自动回退默认，不抛出到 UI。

### 2026-11-16 M5 平台元数据

- 规格：新增 `spec-m5-platform-metadata.md`；只统一只读描述符，不改执行、权限与路由。
- shared：新增 `schemas/tool/tool.ts` 与 `ToolDescriptor`；`PERMISSION_LEVELS`、`PROVIDER_CAPABILITY_KEYS`、`PROVIDER_PROTOCOL_CAPABILITIES` 落入常量。
- core：新增 `tools/descriptor/` 适配内置、流程与 MCP 工具；`listDebugTools()` 返回统一描述符并纳入已发布流程工具；`toToolDefinitions` 与执行器未改。
- web：工具调试台改用 `permissions` / `inputSchema`；流程编辑器构造统一描述符；供应商卡片新增流式/工具调用/视觉/向量只读徽章与说明。
- 测试：工具与 provider 回归 184 项、web 工具/流程 18 项、供应商路由 5 项通过；`pnpm check` 全绿。
- 说明：provider 能力是协议级声明，不代表单个模型；不参与模型选择或自动路由。

### 2026-11-16 M6 收尾

- 版本：root / web / desktop / shared version 同步到 `4.3.0`，提交 `chore(release): 4.3.0` 后再构建。
- 测试：9 包 736 个测试文件 4180 项通过；web 282/1433、core 270/1657、database 75/283、shared 46/402、desktop 33/218、ai 16/86、voice 9/85、config 4/14、motion 1/2。
- 门禁：`pnpm check` 全绿；`check:assets` 三席 22.29MB / 25MB，13 条非阻断警告；零数据库迁移，`LATEST_SCHEMA_VERSION = 51`。
- 发布物料：`release-notes.md`、`version-summary.md`、`blog/v4.3/` 10 篇与路线图索引已落盘。
- 安装包：`WorkBuddyForMe-Setup-4.3.0.exe` 264.76MB（277,622,869 字节），SHA256 `3f075e3f…ab576db`；归档于 `E:\builds\archive\v4.3.0`，`release-manifest --check` 校验通过 3 个产物。
- 待办：安装包真机验证；通过后合并 main、打 tag `v4.3.0` 并推送工蜂。

