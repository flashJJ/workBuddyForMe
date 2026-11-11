# v3.0 进度与决策留痕

> 用途：每次推进都留下“做了什么、为什么、结果、下一步”，避免只靠聊天记录追踪。
> 关联：[执行路线](./execution-roadmap.md)、[阶段表](./README.md#7-阶段拆分)。

## 记录规则

1. 每个任务完成后追加一条工作日志：日期、阶段、任务、结果、文件/提交、指标、遗留。
2. 影响范围或方向的选择写入决策日志：背景、选项、选择、原因、待复核点。
3. 性能/体积等数字必须写口径与来源；未实测的标注“待实测”。
4. 计划变更先改 `execution-roadmap.md`，再在本文件记录变更原因。
5. 每个 Gate 通过时更新“当前状态”；未通过不提前标记完成。

## 当前状态

| 阶段 | 状态 | 最近更新 |
|---|---|---|
| P0 基线收尾 | 进行中 | 2026-11-11 |
| P1 M0d-A 能力解锁 | 进行中（T2.1 完成） | 2026-11-11 |
| P2 M0d-B 内容做厚 | 未开始 | 2026-11-11 |
| P3 M0d-C 剧本接线 | 未开始 | 2026-11-11 |
| P4 M0b 运行时补齐 | 未开始 | 2026-11-11 |
| P5 M1/M2 | 部分完成（内置雪团） | 2026-11-11 |
| P6 M3/M4/M5 | 未开始 | 2026-11-11 |
| P7 插件化 | 方案完成 | 2026-11-11 |

## 决策日志

| 编号 | 日期 | 决策 | 原因 | 待复核 |
|---|---|---|---|---|
| D1 | 2026-11-11 | 代码许可改为 PolyForm Noncommercial 1.0.0；雪团模型 CC BY-NC-SA 4.0 | 用户要求禁止商用；代码与美术素材分别适用不同协议 | 正式发布前法务口径 |
| D2 | 2026-11-11 | 内置雪团 VRM 作为新用户默认形象 | 避免用户导入；静态资源随包分发 | 安装包体积 |
| D3 | 2026-11-11 | AnimeArt 模型按“家族模板”处理：同骨架 + 同面部 morph + 共享 binding | 6 个模型 49/49 骨骼、rest 0° 差、118 morph、18 表情索引一致 | 100 个非标准 morph 的语义顺序需抽查 |
| D4 | 2026-11-11 | 动效库升级先做执行器（morph/look/expression），再做内容 | 轨道已定义但未执行，是当前瓶颈 | 无 |
| D5 | 2026-11-11 | 正式 cast 暂定雪团；小白鲸/海豚先做回归 cast，不入正式名单 | 用户暂未选角色；先用 2 个模型验证可移植性 | M1 角色评审 |
| D6 | 2026-11-11 | 测试模型保留 Animeit/CC0，仅内部测试；正式入项目再改许可 | 避免过早改元数据；当前只做技术验证 | M1 角色评审 |
| D7 | 2026-11-11 | P4（Q 版）与 P2/P3 并行；P7 插件化等 P3 后 | 避免阻塞内容主线；契约稳定后再拆包 | P3 结束后复核 |
| D8 | 2026-11-11 | 模型体积暂按 25–32MB 可接受，正式角色目标 ≤20–25MB | 精简后仍超 20MB；先保观感，后续做贴图压缩 | P2 资产评审 |

## 工作日志

### 2026-11-11 M0c T1.7–T1.9

- 内容：behavior cue 贯通剧本；行为观测 + `__petDebug.behaviors` + dev 预览面板；golden 快照与 dt=0 冻结测试。
- 结果：avatar 35 文件 212 测试通过；typecheck/lint/行数/结构/循环全绿。
- 提交：`e616f2ae`（M0c 动效库）、`2ea20207`（dev 黑屏重试）、`7b0ceeb3`（方案文档）。
- 遗留：p95/4h 长稳。

### 2026-11-11 内置雪团 + 许可

- 内容：`public/vrm/models/xuetuan.vrm` 24.05MB；`builtin:xuetuan` 静态解析；模型选择器“内置 · 雪团”；新用户默认；代码许可 PolyForm NC；模型 CC BY-NC-SA。
- 结果：静态资源 200；shared/web/core/pet 相关测试通过；门禁全绿。
- 提交：`686f5ca2`（功能 + 许可合并提交，避免中间态 GPL 代码 + 非商用素材）。
- 遗留：安装包体积增加约 24MB；正式发布前复核许可。

### 2026-11-11 AnimeArt 家族验证与精简

- 模型：小白鲸、海豚、鲨鱼、水母、企鹅、海獭；原始 39.6–46.6MB。
- 骨架：6/6 与雪团一致（49 humanoid、父级 0 差异、rest 四元数 0° 差、比例 RMS 0.015–0.09）。
- 面部：6/6 为 118 morph、11 个面部 primitive、18 个 VRM 表情绑定索引一致；缺 `targetNames`。
- 精简：删除 118 个全零 morph NORMAL（约 14.34MB/模型）；输出 24.98–32.24MB 到 `C:\Users\aa707\Documents\3D模型\AI模型精简版`。
- 补齐：118 个 `targetNames` 按雪团顺序写入；POSITION 哈希一致；0 orphan / 0 NORMAL target。
- binding：`animeart-v1.binding.json`（家族级，standardExpressions + channels + reservedChannels）；fingerprint 记录 6 个模型。
- 遗留：海豚/企鹅仍 >20MB（贴图/材质）；100 个非标准 morph 语义顺序需抽查；测试模型许可未改。

### 2026-11-11 执行路线评审

- 用户确认按 `execution-roadmap.md` 逐步推进，要求过程中多留痕。
- 本文件建立；P0 启动。

### 2026-11-11 T1.9 4h 长稳（进行中）

- 口径：桌宠页每 5 分钟采样 10s，rAF 回调耗时 + WebGL clear 帧数 + 堆 + DOM。
- 截至 minute 180（3h）：渲染 30fps；回调 p95 0.9–1.0ms；堆 167.9–189.4MB；DOM 41 节点。
- 结论：待 4h 完成后写最终报告；目前无 p95 退化，堆需看最终漂移。

### 2026-11-11 P1 T2.1 binding 契约与加载器

- 内容：`MotionBinding` zod schema、`buildMorphBinding`（O(1) 通道索引、名称/索引/保留通道校验）、`animeart-v1` 家族 binding 入代码。
- 决策：`standardExpressions.weight` 统一为 0..1；VRM0 原始的 0–100 已在 binding JSON 中归一。
- 结构：`binding.test.ts` 放入 `__tests__/binding/`，避免测试目录直接文件超 12。
- 结果：binding 5 项测试通过；typecheck/lint/行数/结构/循环通过。
- 文件：`animation/binding.ts`、`animation/bindings/animeart-v1.json`、`animation/__tests__/binding/binding.test.ts`、`animation/index.ts`。
- 遗留：T2.2 `MorphExecutor`；100 个非标准 morph 首次导入抽查；运行时按模型选择 family binding。

## 下一步

1. P0：4h 长稳收尾 + T1.9/T0.9 报告。
2. P1 T2.2：`MorphExecutor` + 原始 morph 写入 + 预览。
3. P1 T2.4：`LookExecutor`，让 `behavior.face-away` 的 look 生效。
4. P0/P1：决定正式 cast 与模型体积口径。
