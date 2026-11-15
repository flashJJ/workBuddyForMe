# 动效库改造方案与下一步

> 按优先级排列；每项完成后回写 changelog 与本文件。

## P8 衔接（2026-11-13 评估）

- 当前动效库是 P8「AI 受限剧本」的原语层与冲突治理层：队列/生成器在上，动作白名单与帧计划在下。
- 三个桥接点已完成（2026-11-13，P5.5.30）：`validateScene` 清洗内置场景并 dev 记录丢弃原因；`sceneBusy` 每帧按活动场次抑制待机余兴与旧点击兜底；`script:motion` 为独立 overlay（全身 mask + loop/fadeMs，场景结束停止循环动作），不复用触摸反应槽。
- P8.1（2026-11-13，P5.5.31）：`validation/registry.ts` 导出生成器可直接使用的原语目录，校验与注册表同源；beat/cue 时间与数值范围纳入 `validateScene`，非法 cue 100% 丢弃并记录。
- P8.2（2026-11-13，P5.5.31）：`scenes/pool.ts` 3 条手动剧本跑通 Director；dev 面板可播放全部场景并查看活跃游标与 cue 日志。
- P8.3（2026-11-13，P5.5.33）：受限提示词 → LLM 文本 → fail-closed 校验 → settings_kv 队列；每日 3 次 / 20k 估算 token 上限，失败回落本地池；面板「生成剧本」可直接出稿并播放。
- P8.4（2026-11-13，P5.5.34）：剧情状态机持久化线索/悬念/主题/梗；生成前注入上下文，生成后去重与收线；`{ story, scene }` 协议兼容旧裸 Scene。
- P8.5（2026-11-13，P5.5.35）：每日 10/16 点自动生成（最多 2 次、默认关闭）；客户端心跳 tick，服务端按持久化窗口判定；失败回落本地池。
- P8.6 部分（2026-11-13）：剧情状态记录每场道具/台词池，最近 2 场道具去重、线索连续 2 场后强制收线；道具扩到 8 个（新增 phone/flower/cushion/lamp），茶杯/碗/书/桌改用圆角与内壁造型。
- P8.6 长剧本与时事（2026-11-13）：单场放宽到 60–180 秒（8–80 beats，允许 wait）；生成前抓当日热点（百度热搜优先，失败时退回联网搜索，生活类白名单过滤），注入「今日时事」；每日额度 8 次 / 60k token。
- 详见 [execution-roadmap.md](../../plan/v3.0/execution-roadmap.md) P8 章节。

## P8 前置：道具层（PropLayer，2026-11-13，S1/S2 已完成）

结论：道具不写进 VRM，也不进 Composer 的骨骼轨道；先在 VRM 运行时做「手型 + 挂点 + 程序化茶杯」原型，验证通过后再接离线资产与剧本 cue。

**边界**

| 层 | 位置 | 职责 |
|---|---|---|
| 资产 | `apps/web/public/props/`、`props/manifest.ts`、`ASSETS-LICENSE.md` | 离线入库、许可、体积、原点；运行时只读 |
| 挂载 | `features/avatar/vrm/props/vrm-prop-layer.ts` | GLB 加载/缓存、raw bone 挂载、attach/detach、dispose |
| 手型 | `features/avatar/animation/poses/hands.ts` | 新增 `cup-hold` 半握；进 POSES + golden |
| 契约 | `packages/shared/src/schemas/script/cues.ts` | `prop` cue，id 只认 manifest 白名单 |
| 执行 | `features/avatar/script/adapters/vrm-adapter.ts` | cue → 控制器；场景结束自动 detach |

**为什么不进动效库核心**：动效库只写骨骼局部旋转，Composer/FrameLedger 负责骨骼区域；道具是场景图对象，挂载点用 raw bone 的世界矩阵，不参与姿势合成。唯一需要进台账的是「持物手型」——`prop:hold` 只 claim 左右臂区域，priority 20，高于待机垂臂/余兴，低于视线叠加。

**阶段**

1. **S1 程序化茶杯原型（已完成 2026-11-13）**
   - 圆柱杯身 + 圆环把手，挂 `rightHand` raw bone（不是 normalized，避免 1/100 缩放）。
   - 新增 `cup-hold` 手型；`pose.prop-hold` 把右臂抬到髋前，杯心沿掌心法线 4.8cm、掌侧向 2.2cm。
   - dev 入口：`controller.attachProp('teacup', on)`。
   - 验收：桌宠窗 260×400 内完整入画；attach 后右臂 owner `prop:hold`，detach 后回 `idle:relax`；换模型/卸载自动清理。指腹与杯壁为近似接触（不透明杯身下不可见），S2 换 GLB 时按资产校准握持点与手型。
2. **S2 离线资产入库（已完成 2026-11-13）**
   - 茶杯/碗/书 3 个 GLB 已入库：`public/props/`，项目自建 CC0-1.0，5.7–15.6 KB；生成脚本 `scripts/avatar/generate-props.mjs`（`pnpm props:build`）。
   - `prop-manifest.ts` 登记 `id/url/kind/license/contact/lateral/handPose/scale/yaw`；`VrmPropLayer` 改为按 manifest 异步加载 GLB，加载期间先进入持物姿态，detach 可取消 pending。
   - dev 验证：桌宠窗聚焦时按 `1/2/3` 切换茶杯/碗/书、`0` 卸下（仅 dev）；正式触发走 S3 的 `prop` cue。
   - `ASSETS-LICENSE.md` 已登记许可与替换约定；外部 CC0 GLB 可覆盖同名文件。
3. **S3 剧本契约（已完成 2026-11-13）**
   - `PropCue { kind: 'prop', prop, action: 'attach' | 'detach' | 'show' | 'hide' }` 已进 shared schema，`cueTrack` 归 `world` 轨。
   - `VrmCueAdapter` 按 `PROPS` 白名单校验；场景结束/打断按本场景 detach，两个场景共用同一道具时先结束不抢卸；`show/hide` 暂映射 attach/detach。
   - 新增 `moment.tea` 场景（body tap 轮换）：挂茶杯 3.2s 后卸下。
   - 待真机：以 `WBFM_PET_SCRIPT=1` 重启后触发 `moment.tea`，确认 cue 日志与道具生命周期。
4. **S4 场景道具与对象池（已完成 2026-11-13）**
   - `table.glb` 已入库；manifest 增加 `kind: 'stage'` 与 `position/rotationY/scale`。
   - stage 道具挂渲染场景根节点（不是 `vrm.scene`），不跟随拎起/呼吸；GLB 只加载一次并进入对象池，detach/hide 只换父节点，dispose 统一释放。
   - `attach/detach` 只对 hand、`show/hide` 只对 stage，错配丢弃并 warn；场景结束按 kind 自动清理。
   - dev：桌宠窗按 `4` 显示桌子、`0` 全部收起；`moment.tea` 已同时挂茶杯 + 显示桌子。
5. **S5 道具自身动画（已完成 2026-11-13）**
   - `prop-animation.ts` 纯时间采样（4.8s 循环）：pour 倾倒 + 水柱透明度、flip 封面开合；`prop-animation-apply.ts` 写入 three 对象。
   - manifest 增加 `animation` 白名单；teacup=pour、book=flip；`VrmPropLayer.update(dt)` 与角色共用同一 dt，在 `vrm.update` 后、render 前推进。
   - 资产：书封改为书脊枢轴 `book-cover`；茶杯补 `wbfm-pour-stream` 半透明水柱。
   - 后续按需：多页翻页、液体粒子/碰撞；当前是封面开合 + 单根水柱。

**不做**：运行时联网下载；AI 自选 URL/prop.id；把道具写进 VRM（只有蒙皮发饰/眼镜才进模型）；PBR 写实材质与高模。

## P0 帧计划与区域所有权（进行中）

- 现状：`FrameLedger` 已记录每帧 `region → owner / priority / intent` 并检测冲突，但不拦截写入。
- 第一步（已完成）：台账 + 冲突告警 + `controller.frameDebug`；行为轨道 mask 投影为区域 claim。
- 第二步（已完成）：骨骼 → 阶段归属、`reapplyPalms()` 手部最后写者、Composer 按 `STAGE_ORDER` 执行；`FramePlan` 在写入前决议，同优先级落败的写者被拒绝（待机垂臂已接入）。
- 第三步（完成）：行为链路与待机余兴的手臂都已走意图表；`motion.wave/shy` 已接回点击兜底（无 VRMA 手势时），`stretch-up` 保持库内容。后续新增动作必须同时给运行时入口。
- 目标：新增动作只改意图表与对应子求解器，不牵动其他区域；回归时先查台账再调数值。

## P1 表情时间曲线

- 现状：行为 morph 是静态通道，被拎起只能「enter 惊讶 → loop 生气」两段跳变。
- 方案：给 morph 轨道增加可选时间函数（`from`/`to` + duration/easing），或在执行器侧提供 `setMorph` 时间回调。
- 目标：惊讶 → 委屈 → 生气可连续过渡；抓取越久情绪越明显。

## P1 手部接触 IK

- 现状：托腮/拥抱/叉腰用世界方向瞄准，手部落点靠目标方向近似。
- 方案：两骨 IK + 手部目标点（下巴/对侧肩/髋部），带极点约束；仅用于强接触动作。
- 目标：托腮手贴下巴、拥抱手不穿胸、叉腰手贴腰侧。

## P2 悬空摆动从正弦改为阻尼摆

- 现状：`pose.lift-struggle` 多频正弦，已能表现挣扎，但缺少惯性/滞后。
- 方案：以抓点为支点，给四肢加弹簧-阻尼（角度/角速度状态），外部输入为小幅随机冲量。
- 目标：更像被拎起的重力摆，而不是程序化波形。

## P2 动作节奏配置表

- 现状：节奏散落在 motion duration、behavior enter/exit、phase fadeMs、scene beat。
- 方案：在 `docs/wiki/motion-library` 维护一张「动作 → enter/hold/exit/fade/场景结束」表；新增动作必须先填表。
- 目标：避免动作被场景截断、普通/情绪动作节奏混乱。

## P2 动效预览与录制

- 现状：dev 预览面板可播放行为，但没有逐帧录制/对比。
- 方案：dev 面板增加「播放 + 录 2s + 采样骨骼/手部坐标」按钮，输出 JSON/截图到 `.tmp`。
- 目标：调参有可复现证据，减少只靠肉眼。

## P3 内容扩容

- 候选：握手、挥手告别、拍肩、被吓到后退、蹲下捡东西。
- 约束：先补 L1 姿势与执行器，再接 L2/L3/场戏；每个动作必须有 golden 与约束测试。

## P3 情绪驱动动作选择

- 方案：Utility 决策层按心情/精力/关系选择动作与节奏；高情绪动作快，日常动作慢。
- 依赖：M3 的 Utility 决策与 CharacterState。

## 维护约定

- 新增动作：先写本条计划/设计，再实现，最后更新 changelog + pitfalls。
- 修复观感问题：必须记录到 pitfalls，附采样数据或截图结论。
- 版本收尾：更新 README 的当前版本与测试数量。
