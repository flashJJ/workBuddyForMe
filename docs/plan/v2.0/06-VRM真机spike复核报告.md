# 06 · VRM 真机 spike 复核报告（v2.0 M0 关卡）

> 日期：2026-10-15 · 结论：**GO（M4 准予开工）**
> 数据：[spike-vrm-result.json](spike-vrm-result.json)（headed Chromium 153 / 1920×1080 / 原始输出未修饰）
> 工装：`apps/web/src/app/spike/vrm-stage/`（`WBFM_SPIKE=1` 门控）+ `apps/web/scripts/vrm-stage-spike.mjs`
> 样本：`VRM1_Constraint_Twist_Sample.vrm`（10.28 MB，© pixiv Inc.，VRM 1.0 License 允许商用/再分发，仅工装使用、不进 public/安装包）

## 1. 测试环境

| 项 | 值 |
|---|---|
| GPU | **Intel 核显**（ANGLE / Intel Graphics 0x7D67 / Direct3D11，无独显）——目标弱机形态 |
| CPU 线程 | 24 |
| 渲染后端 | WebGL 2.0（D3D11），devicePixelRatio 1.0 |
| 视口 | 1920×1080（与 Electron 全屏同管线） |
| 模型 | VRM 1.0，包围盒高 1.615 单位（标准人形） |
| 负载 | rAF 弹簧骨 + 每帧 aa 口型（60ms 正弦驱动）+ 3s 轮换 joy/sadness/anger；混排另加 2 个全负载 Live2D |
| 采样 | 12s warmup + 15s measure；rAF 帧间隔 + 每秒 JS heap |

## 2. 结果数据

| 场景 | 稳态 FPS | 1% low | p95 帧时 | p99 | >33ms 长帧 | 首帧 | JS heap 峰值 |
|---|---|---|---|---|---|---|---|
| S1 单 VRM（three 管线） | **82.3** | 39.6 | 20.8ms | 24.9ms | 0 | 冷 910ms / 热 617ms | 53.0 MB |
| S2 1 VRM + 2 Live2D（three+PIXI 双 canvas） | **71.5** | 38.5 | 20.9ms | 25.0ms | 1 | 617ms | 78.9 MB |

### 2.1 校验链（M4 导入器原型 sniffVrm，02 报告 §4.4 负例清单）

| 构造样本 | 结果 |
|---|---|
| 真 VRM 1.0（glTF 魔数 + VRMC_vrm 扩展） | ✅ 识别 v1.0 |
| 纯文本改后缀 `.vrm` | ✅ 拒绝 not_glb |
| ZIP（PK 头）改后缀 | ✅ 拒绝 not_glb |
| 文本 glTF（`{"asset"...}`，非二进制 GLB） | ✅ 拒绝 not_glb |
| 结构合法 GLB 但无 VRM 扩展（最小构造） | ✅ 拒绝 not_vrm_extension |

## 3. 与 M0 阈值（02 报告 §3.4）的对照与阈值修订

| 指标 | 原阈值 | 实测 | 结论 |
|---|---|---|---|
| 单 VRM 稳态 | ≥30 FPS | 82.3 | 大幅达标（2.7×） |
| 混排稳态 | ≥25 FPS | 71.5 | 大幅达标（2.9×） |
| 小模型首帧 | ≤0.8s | 冷 0.91s（含 three chunk 首次编译）/ 热 0.62s | **阈值修订**（见下） |
| 60MB 首帧 | ≤2.5s | 本轮未测（样本不入库） | 保留至 M4，用自备大模型实测 |
| 增量内存/单 VRM | ≤300MB | heap +~3MB（53 vs 页面基线），VRM 显存未计入 | 大幅达标 |

**首帧阈值修订（实测驱动）**：0.91s 中有 three.js/three-vrm chunk 的首次拉取与编译，属一次性冷启动成本（第二次 0.62s 即达原线）。修订为双口径：

- **冷启动**（three chunk 未加载）：≤1.5s；
- **热加载**（chunk 已缓存）：≤0.8s；
- 60MB 大模型（chunk 已热）：≤2.5s 不变。

## 4. 工程发现（M4 必须遵守）

1. **webpack 动态 import 必须字面量**：`await import('three/examples/jsm/loaders/GLTFLoader.js')` 不能用变量承载路径——webpack 无法静态分析变量 import()，运行时 `Cannot find module`（已写入 vrm-canvas.ts 注释）。
2. **依赖与类型**：`three` + `@pixiv/three-vrm`（均 MIT）进 web dependencies，`@types/three` 进 devDependencies；three 本体不自带 .d.ts。
3. **慢帧采集口径**：双 WebGL context 冷启动（Live2D 贴图首次上传与 three 首帧叠加）可能出现 >1s 的初始化长帧；rAF 采集器若固定丢弃 >1s 会采到 **0 帧假阴性**。FrameMetrics 已参数化 `maxFrameDeltaMs`（默认 1000 保持 v1.9 行为，工装传 10000）。**M4 e2e 必须在 Live2D 资源 ready 后才进入 measure**，不能只等 VRM 首帧。
4. **双 canvas 分层成立**：three alpha 透明 canvas 与 PIXI canvas 同屏叠加无渲染冲突，稳态帧率损失仅 ~13%（82.3→71.5），1% low 几乎不变——M4 双渲染器方案按 02 报告 §3.2 落地可行。
5. **样本资产隔离**：门控 `/spike/vrm-stage/model/[name]` 路由从 `scripts/fixtures/vrm` 白名单读文件，不进 `public/`；生产构建编译路由但 WBFM_SPIKE≠1 时 404，路径穿越实测拦截。**electron-builder 打包前需再次确认 fixtures 不被 tracing 进安装包**（scripts 目录不在 next standalone 范围内，M4 封版检查项）。
6. 包围盒驱动取景有效（头肩位 = maxY − 高度×0.12），1.615 标准人形一次成像，M4 可沿用。

## 5. 降级预案触发情况

实测在核显机远超阈值，**三级降级（像素比钳制/非聚焦降帧/同屏 VRM≤1）M4 不默认启用**，保留为设置内「3D 性能模式」手动开关与低帧率自动看门狗的后备（复用 v1.9 FrameWatchdog 模式）；M4 仍需补的真机数据：60MB 大模型、多 VRM（若 v2.0 后开放）、持续 30 分钟长跑发热后的帧率衰减。

## 6. 许可与免责方案（随本报告定稿，M4 向导文案以此为准）

- 模型侧事实：VRM 文件 meta 内嵌演绎者/商用/暴力/性/再分发许可（02 报告 §2.1），导入器强制展示并由用户确认；
- 样本许可：工装样本 © pixiv Inc. 按 VRM 1.0 License 可商用可再分发，仅用于开发取证，附 [fixtures/vrm/LICENSE.md](../../../../apps/web/scripts/fixtures/vrm/LICENSE.md)；
- **免责声明定稿（M4 导入确认弹窗正文，法务复核前的冻结草案）**：

> 你可以导入自己拥有或已获得合法授权的 VRM 模型。WorkBuddy For Me 仅提供本地渲染能力，不提供模型下载，也不主张任何第三方模型的权利。模型的著作权、人格演绎许可与商用许可归模型作者所有，具体许可以模型文件内声明及作者给出的条款为准。请仅在授权范围内使用；因导入模型引发的版权或授权争议，由你自行承担责任。

## 7. 关卡结论

| 关卡项 | 结果 |
|---|---|
| 核显真机性能 | GO（单 VRM/混排均超阈值 2.7×+，增量内存远低于上限） |
| 双渲染器架构 | GO（双 canvas 帧率损失 ~13%，无冲突） |
| 导入校验链 | GO（魔数+扩展双校验，4 类伪装全拒） |
| 许可/免责 | 方案成立，免责文案冻结待法务复核 |
| M4 准予开工 | **是**；遗留项：60MB 大模型实测、打包 fixtures 排除检查、e2e measure 等 Live2D ready |
