# 动效库变更记录

> 只追加；每条注明日期、版本、改动、验证与相关文件。

## 2026-11-13 P5.5.35 P8.5 定时入口

- 调度：新增 `generation/schedule/`，固定 10 点 / 16 点两个窗口、每日最多 2 次、两次间隔 ≥4h；`enabled` 跨天保留、`runsToday` 每天清零；默认关闭。
- 服务：`createPetScriptScheduler` 不建常驻定时器；`tick` 到期才调用生成器，先记窗口再生成，失败也消费窗口；`setEnabled` 持久化开关。
- 路由：`GET /api/pet/script` 返回 `schedule`；新增 `POST /api/pet/script/tick` 与 `POST /api/pet/script/schedule`；服务端装配收敛到 `generation/server.ts`。
- 客户端：`useGeneratedScripts` 启动 tick 一次 + 每 10 分钟心跳；面板新增「自动：开/关」与今日自动次数。
- 验证：schedule 3 项、scheduler 5 项；真机开启自动后 tick 立即触发（runsToday 1/2、usage 3/3）；模型输出漏 `behavior.` 前缀被 fail-closed 拒绝并回落本地池（提示词已补明确示例）；web 全量 244 文件 1243 项（2 worker，默认并发在 dev 双进程下会 OOM）、typecheck、门禁通过。
- 相关：`script/generation/schedule/*`、`scheduler.ts`、`server.ts`、`app/api/pet/script/{tick,schedule}/route.ts`、`use-generated-scripts.ts`、`script-debug-panel.tsx`。
- 遗留：热点抓取未接；开关目前在 dev 面板，后续接设置页；心跳依赖桌宠窗打开（不做服务端常驻定时器）。

## 2026-11-13 P5.5.34 P8.4 剧情状态机

- 契约：shared 增加 `PetScriptStoryMeta`（title/theme/tags/cliffhanger/resolves）与 `PetScriptStorySummary`；生成结果/队列视图都带 `story` 摘要。
- 状态：新增 `generation/story.ts`，记录线索（open/closed）、当前悬念、最近主题与已用梗；提供 `findDuplicate`（同主题或共享 2 个标签即拒绝）、`ingestStory`（续接/收线/开新坑）、`storyContextForPrompt`（拼进生成提示词）。
- 生成协议：输出改为 `{ story, scene }`，兼容裸 Scene（按 id/cue 派生最小元信息）；`cliffhanger` 与 `resolves` 二选一。
- 服务：生成前带剧情上下文；生成后先去重再入账；`settings_kv` 新增 `pet-script.story`，与队列/用量分开存储。
- 面板：新增「线索 n · 悬念 …」，悬停可看最近主题；生成按钮继续显示每日用量。
- 验证：story 5 项、parse +2、service +2；真机生成 `gen.work-streak-tea`（2/3 次，3473 tok），留下悬念「茶杯见了底，他还没想好要不要续第二杯」，面板显示线索 1；播放后 behavior/茶杯按时清理；web 全量 242 文件 1235 项、typecheck、行数/结构/循环门禁通过。
- 相关：`packages/shared/src/schemas/script/generated.ts`、`script/generation/story.ts`、`parse.ts`、`protocol.ts`、`service.ts`、`app/api/pet/script/route.ts`、`script/devtools/script-debug-panel.tsx`。
- 遗留：P8.5 定时入口与 P8.6 日常回顾未接；当前仍需手动点「生成剧本」。

## 2026-11-13 P5.5.33 P8.3 受限剧本生成器

- 契约：shared 新增 `PetScriptGenerationRequest/Result/View` 与 `PET_SCRIPT_GENERATION_LIMITS`（每日 3 次、估算 20k token、单场 24 beat / 30s、队列 6）。
- 生成协议：`script/generation/protocol.ts` 用 `SCRIPT_PRIMITIVES` 生成受限提示词；只暴露预设/动作/行为/表情/手势/视线/台词池/道具，要求单触发键、4–24 beats、6–20s、至少一句台词。
- Fail-closed 校验：`parse.ts` 走 `sceneSchema` + 生成专用约束（`gen.` 前缀、触发键白名单、禁用 sleep/face-away/sit 等带状态原语、道具成对、禁 VRMA/speak/branch），最后再过 `validateScene`，任何丢弃即整条拒绝。
- 服务与存储：`service.ts` 每日预算 → 默认对话模型 → 提示词 → 文本 → 校验 → 入队；无模型/输出非法/超额都回落本地池，失败也计一次调用；队列与用量存 `settings_kv` `pet-script.generation`，跨天自动清零。
- 路由：新增 `GET/POST /api/pet/script`；GET 返回队列 + 用量，POST 生成一条。
- 客户端：`useGeneratedScripts` 启动拉队列、面板「生成剧本」按钮触发；`useScriptDirector` 支持 `extraScenes`，并把动态场景并入触发键索引（生成场景可被真实事件触发）；dev 面板新增 gen 分组、生成按钮与用量显示。
- 验证：新增 generation 13 项 + director 动态触发 1 项；真机生成 `gen.work-streak-teacup`（9 beats、1612 tok、1/3 次），面板可播放，茶杯 4s 挂载 / 25s 收起，结束后清理干净；web 全量 241 文件 1226 项、typecheck、行数/结构/循环/ascii 门禁通过。
- 相关：`packages/shared/src/schemas/script/generated.ts`、`features/avatar/script/generation/*`、`app/api/pet/script/route.ts`、`script/use-script-director.ts`、`script/devtools/script-debug-panel.tsx`、`pet/pet-stage.tsx`。
- 遗留：生成器目前手动触发；P8.4 剧情状态/去重、P8.5 定时热点入口尚未接。

## 2026-11-13 P5.5.32 剧本面板穿透态可点击

- 现象：桌宠处于鼠标穿透时，右上/左下的剧本调试面板点不到；模型本体可点，面板区域点击落到桌面。
- 根因：主进程只按「模型命中轮廓」翻转穿透（Windows 穿透转发的 mousemove 不可靠，用全局光标轮询）；面板在模型轮廓之外，永远处于穿透态，渲染层收不到点击；左下角还被 Next dev 指示器覆盖。
- 修复：命中轮廓新增 `ui` 多边形（shared `PetHitPolygon` 白名单放行）；`usePetHitProxy` 统一拼接模型 + UI 矩形并去重上报；`ScriptDebugPanel` 每 300ms 上报实际 DOMRect，展开/收起时 `useLayoutEffect` 立即上报（不等轮询），默认收起、移到右上角避开 dev 指示器。
- 验证：真机（`WBFM_PET_SCRIPT=1`，clickThrough=true）真实鼠标点击右上「剧本」可展开、点「收起」可收回，点击 `pool.morning-tea` 按钮可播放；身体点击仍触发 `touch::body::tap`；展开/收起全程无运行时异常（此前控制台的 `reading 'moves'` 报错是验证用临时探针，已随页面重载清除）；web 全量 238 文件 1212 项、shared 14 项、typecheck、行数/结构/循环门禁通过。
- 相关：`packages/shared/src/pet.ts`、`pet/stage/hit-proxy.ts`、`script/devtools/script-debug-panel.tsx`、`pet/pet-stage.tsx`。
- 规则：任何放在模型轮廓之外的桌宠 UI（调试面板/悬浮按钮）都必须并入 hit proxy，否则穿透态必然不可点。

## 2026-11-13 P5.5.31 P8.1 注册表/时间约束 + P8.2 剧本池与 dev 面板

- P8.1 注册表：新增 `script/validation/registry.ts`，统一导出 `SCRIPT_PRIMITIVES`（poses / posePresets / motions / behaviors / expressions / gestures / lookTargets / linePools / props）与运行时集合视图；`validate.ts` 改为消费同一来源，新增 pose/motion/behavior/prop 时不再两处维护。
- P8.1 时间约束：beat.at 限定 0..BEAT_MAX_MS，乱序 beat 稳定排序并记录；wait/holdMs/line.ms 上限、gesture intensity 与 look weight 范围、speak 文本长度、VRMA fileRef 长度均纳入校验；清洗后无合法 beat 记录原因。
- P8.2 剧本池：新增 `scenes/pool.ts` 3 条手写剧本（morning-tea 手持+场景道具、reading-break 书本+伏案行为、desk-stretch 剧本 motion），无触发键、只能手动播放；已并入 `BUILT_IN_SCENES`（23→26）。
- P8.2 dev 面板：新增 `script/devtools/script-debug-panel.tsx`，分组列出全部场景、一键 `playScene`、轮询活跃游标与最近 12 条 cue 日志、显示 events/handled/lastTrigger；`WBFM_PET_SCRIPT=1` 时挂到桌宠舞台左下角，生产不渲染。
- 验证：新增 registry 2 项、pool 5 项、validate 增至 7 项；web 全量 238 文件 1212 项、typecheck、行数/结构/循环门禁通过。
- 修复（P8.2 真机发现）：`useScriptDirector` 的控制器目标补上 `playBehaviorNow` 与 `stopBehavior(id, clearQueue)` 转发。此前行为 cue 只走 `playBehavior`，同优先级会排队；场景结束按 id 停止也失效，导致桌宠残留 `behavior.chin-rest`。补接线后 `pool.reading-break` 能强制接管并在结束停行为。
- 相关：`script/validation/registry.ts`、`validate.ts`、`script/scenes/pool.ts`、`script/devtools/script-debug-panel.tsx`、`script/scenes.ts`、`script/use-script-director.ts`、`avatar/index.ts`、`pet/pet-stage.tsx`。
- 真机：面板点击三条 pool 剧本均通过——morning-tea 茶杯+桌子成对清理；reading-break 书本 + `behavior.work-focus` 接管并在结束停行为；desk-stretch `script:motion` 六个区域 claim 后自动释放；面板展开/收起正常。

## 2026-11-13 P5.5.30 P8 三个桥接点

- 校验：新增 `script/validation/validate.ts`；`validateScene/validateScenes` 对照 POSES/MOTIONS/BEHAVIORS/表情/台词池/道具白名单清洗 cue，branch 递归清洗、空 branch 丢弃；`useScriptDirector` 启动时清洗内置场景，dev 打印丢弃原因。
- 场次门控：`VrmIdleOverlay.setScriptBusy` 在剧本播放期间释放并抑制待机余兴/重心摆动；`useScriptDirector.onFrame` 每帧按 `director.getActive()` 同步 `VrmController.setScriptBusy`；无触发键/无场景的旧点击在剧本进行中被吞掉，不再回退旧 Resolver。
- 剧本动作：新增 `VrmScriptMotionOverlay`（`vrm/overlay/script-motion/`），全身 mask + cue 的 loop/fadeMs，非循环动作结尾自动淡出；独立于触摸反应槽，点击与 `script:motion` 互不打断；`VrmCueAdapter.motionByScene` 记录场景归属，场景结束按 id 停止循环动作（多场景共用不抢停）；帧台账新增 `script:motion`（priority 15）。
- 验证：新增 script-motion 4 项、idle scriptBusy 1 项、adapter motion 清理 1 项；web 全量 236 文件 1201 项、shared 385 项、typecheck、行数/结构/循环门禁通过。
- 相关：`script/validation/validate.ts`、`script/use-script-director.ts`、`vrm/overlay/vrm-idle-overlay.ts`、`vrm/overlay/script-motion/vrm-script-motion.ts`、`vrm/vrm-pose-layer.ts`、`vrm/vrm-controller.ts`、`script/adapters/vrm-adapter.ts`、`animation/frame/regions.ts`。
- 待真机：`WBFM_PET_SCRIPT=1` 下 `moment.tea` 与循环 `motion` cue 的完整验收。

## 2026-11-13 P5.5.29 S5 道具自身动画

- 采样：新增 `prop-animation.ts`（纯时间函数，4.8s 循环：pour 倾倒 + 水柱透明度、flip 封面开合）；`prop-animation-apply.ts` 把采样写入对象。
- 运行时：manifest 增加 `animation?: 'pour' | 'flip'`，teacup=pour、book=flip；`VrmPropLayer.update(dt)` 与角色共用同一 dt，在 `vrm.update` 后、render 前推进。
- 资产：`book.glb` 封面改为书脊枢轴 `book-cover`；teacup 挂载时程序化补一条 `wbfm-pour-stream` 水柱。
- 验证：真机 pour 杯身倾倒、水柱 opacity 0.548；flip 封面 `coverY=-1.2`；web 全量 234 文件 1191 项通过；typecheck、行数/结构/循环门禁通过。
- 相关：`vrm/props/prop-animation.ts`、`prop-animation-apply.ts`、`vrm-prop-layer.ts`、`prop-manifest.ts`、`scripts/avatar/generate-props.mjs`。
- 说明：水柱是单根半透明圆柱，不做液体碰撞；翻页是封面开合，多页翻动留后续。

## 2026-11-13 P5.5.28 S4 场景道具与对象池

- 资产：新增 `public/props/table.glb`（4.1 KB，自建 CC0-1.0）；manifest 增加 `kind: 'stage'` 与 `position/rotationY/scale`；`ASSETS-LICENSE.md` 更新。
- 运行时：`VrmPropLayer` 同时支持 hand/stage；stage 挂渲染场景根节点（不是 `vrm.scene`），不跟随拎起/呼吸；GLB 只加载一次并进入对象池，detach/hide 只换父节点，dispose 统一释放。
- 契约：prop 动作与 kind 严格匹配（attach/detach ↔ hand，show/hide ↔ stage），错配丢弃并 warn；场景结束按 kind 自动清理。
- 场景：`moment.tea` 同时挂茶杯 + 显示桌子，3.2s 后一起收起。
- 验证：桌宠窗按 `4` 显示桌子、`0` 全部收起；web 全量 233 文件 1188 项通过；typecheck、行数/结构/循环门禁通过。
- 相关：`avatar/vrm/props/prop-manifest.ts`、`vrm-prop-layer.ts`、`script/adapters/vrm-adapter.ts`、`script/scenes/moments.ts`、`scripts/avatar/generate-props.mjs`。
- 遗留：桌子为自建低模占位；S5 道具自身动画未接。

## 2026-11-13 P5.5.27 S3 剧本 prop cue

- 契约：`packages/shared/src/schemas/script/cues.ts` 新增 `PropCue { kind: 'prop', prop, action: 'attach' | 'detach' | 'show' | 'hide' }`；`cueTrack` 归 `world` 轨，可与 body/voice/face 并行。
- 执行：`VrmCueAdapter` 新增 `attachProp` 能力与 `propScenes`；未登记 id 按 `PROPS` 白名单丢弃并 warn；场景结束/打断按本场景卸下，两个场景共用同一道具时先结束不抢卸；`show/hide` 暂映射 attach/detach，场景道具留给 S4。
- 场景：新增 `moment.tea`（body tap 轮换）：0s 挂茶杯 → 3.2s 卸下 → 场景结束。
- 验证：shared cues/scene 10 项、adapter 19 项、moments 10 项通过；web 全量 233 文件 1185 项通过；typecheck、行数/结构/循环门禁通过。
- 相关：`packages/shared/src/schemas/script/cues.ts`、`scene.ts`、`script/adapters/vrm-adapter.ts`、`script/use-script-director.ts`、`script/scenes/moments.ts`。
- 待办：在 `WBFM_PET_SCRIPT=1` 会话真机触发 `moment.tea`；S4 接场景道具 show/hide 与对象池。

## 2026-11-13 P5.5.26 S2 道具 GLB 入库与 manifest

- 资产：新增 `apps/web/public/props/{teacup,bowl,book}.glb`（项目自建 CC0-1.0，5.7–15.6 KB），由 `scripts/avatar/generate-props.mjs` / `pnpm props:build` 生成；`ASSETS-LICENSE.md` 已登记。
- Manifest：新增 `vrm/props/prop-manifest.ts`（id/url/kind/license/contact/lateral/handPose/scale/yaw）；`VrmPropLayer` 改为按 manifest 异步加载 GLB，加载期间立即进入持物姿态，detach 可取消 pending。
- 兼容：S1 程序化茶杯被 GLB 资产替换；`VrmController.attachProp` 改为返回 `Promise<boolean>`；`prop:hold` 台账与 `pose.prop-hold` 持物姿态不变。
- dev 验证入口：桌宠窗聚焦时按 `1/2/3` 切换茶杯/碗/书、`0` 卸下全部（仅 dev；正式触发走 S3 的 `prop` cue）。
- 验证：260×400 桌宠窗对 teacup/bowl/book 逐一 attach/detach，`props` 与右臂 owner 正确切换；三个道具截图完整入画；单测覆盖 manifest 加载、pending 取消、幂等、卸载、未知 id；web 全量 232 文件 1180 项通过；typecheck、行数/结构/循环门禁通过。
- 相关：`scripts/avatar/generate-props.mjs`、`avatar/vrm/props/prop-manifest.ts`、`avatar/vrm/props/vrm-prop-layer.ts`、`ASSETS-LICENSE.md`。
- 遗留：书/碗复用 `cup-hold` 手型，握持距离由 manifest 调整（书 `contact=0.10` 以避免手指穿封面）；S3 接 `prop` cue 时按资产微调手型。

## 2026-11-13 P5.5.25 S1 道具层茶杯原型

- 改动：
  - 新增 `VrmPropLayer`：程序化茶杯挂 `rightHand` raw bone（不是 normalized），attach 时按掌心法线（4.8cm）+ 掌侧向（2.2cm）计算本地偏移并以世界 +Y 立杯；detach/dispose 释放几何与材质。
  - L1 新增 `cup-hold` 半握（只写手指，不重置手骨）；新增 `PROP_HOLD_RIGHT` 手臂意图与 `pose.prop-hold` 执行器，持杯时右手抬到髋前。
  - `VrmController.attachProp(id, on)` 作为 dev 入口；帧台账新增 `prop:hold`（priority 20，只 claim 持物手），高于垂臂/余兴、低于视线。
- 验证：桌宠窗 260×400 下 attach 成功，`props.hold=pose.prop-hold`，右臂 owner `prop:hold`；detach 后 owner 回 `idle:relax`，杯体完整入画；换模型/卸载由 controller.dispose 清理；单测覆盖挂载/幂等/卸载/未知 id、持物手型与执行器；web 全量 231 文件 1177 项通过；typecheck、行数/结构/循环门禁通过。
- 相关：`avatar/vrm/props/vrm-prop-layer.ts`、`avatar/animation/poses/hands.ts`、`avatar/animation/arms/intents.ts`、`avatar/animation/adapters/vrm-executors.ts`、`avatar/vrm/overlay/vrm-frame-ledger.ts`。
- 遗留：手指与杯壁是近似接触，不透明杯身下不可见穿模；S2 换 GLB 时按资产调整握持点/手型。

## 2026-11-13 P5.5.24 桌宠窗加高与拎起头部余量

- 改动：
  - `PET_WINDOW_HEIGHT` 340 → 400，透明窗高度增加，给拎起动作留出头顶空间。
  - 桌宠取景改为「脚底贴底 + 头顶 10% 余量」：`fitVrmToCamera` 新增 `bottomAlign` / `topHeadroom`，大档放大后仍保证头部不被裁切。
  - `VrmCanvas` 新增 `isPet` 取景标记，主窗仍保持竖直居中，不受桌宠取景影响。
- 验证：260×400 视口 + lg 设置，取景 `scale=0.970`、`fitsX/fitsY=true`；拎起截图头部完整、头顶约 50px 透明余量；web 441 项 + desktop 74 项测试通过；typecheck、行数/结构/循环门禁通过。
- 相关：`desktop/src/main/pet/pet-window.ts`、`avatar/vrm/vrm-fit.ts`、`avatar/vrm/vrm-canvas.tsx`。

## 2026-11-13 P5.5.23 头部拖拽改用屏幕坐标

- 改动：`PetHitHead` 的按下点与位移从 `clientX/clientY` 改为 `screenX/screenY`，与 `PetHitBody` 保持一致。
- 原因：窗口在 6px 阈值后开始跟手，`clientY` 不再变化，`dy` 永远到不了 24px 的 `RAISED_THRESHOLD_PX`；身体盒早已用 `screenY`，头部漏改，表现为“拖身体能拎起、拖头不能”。
- 验证：合成指针事件保持 `clientY` 不变、`screenY` 上移 60px → `behavior.lifted` loop；pointerup → 回 idle；pet/script/pose 126 项测试通过；typecheck、行数/结构门禁通过。
- 相关：`features/pet/pet-hit-regions.tsx`。

## 2026-11-13 P5.5.22 场景行为归属停止、残留 reaction 与待机恢复

- 改动：
  - `VrmCueAdapter.end(sceneId)` 改为按「本场景启动的行为 id」精确停止，并清空排队行为；不再用「是否还有其他场景行为」判断。
  - `stopBehavior(behavior?, clearQueue?)` 贯通 `VrmController → VrmPoseLayer → VrmAnimationRuntime → BehaviorRunner`；行为 id 不匹配时拒绝停止，避免误停另一个场景的行为。
  - 行为接管时 `VrmIdleOverlay` 同时清空 `reaction`，避免 `reacting` 残留导致 relax 被抑制。
- 原因：摸头场景结束后 `behavior.head-pat` 仍在 loop（真机 85 秒），待机看起来像「换了个姿势、头是歪的」；同时队列堆了 `hands-on-hips/chin-rest/yawn`，造成点击拥塞。
- 验证：摸头场景 +1.0s 进入 head-pat loop，+3.2s 行为为空、活动场景为空、队列为空；恢复后 owner 回到 `base:clip + idle:relax`；2 秒微摆动 hand 0.053 / foot 0.017 / finger 0.522；强制 `hands-pocket` 余兴 4.6s 后自动清除并恢复微摆；avatar+pet 439 项通过；typecheck、行数/结构/循环门禁通过。
- 相关：`animation/behavior.ts`、`animation/adapters/vrm.ts`、`vrm/vrm-pose-layer.ts`、`vrm/vrm-controller.ts`、`script/adapters/vrm-adapter.ts`、`vrm/overlay/vrm-idle-overlay.ts`。

## 2026-11-13 P5.5.21 松手立即落地、行为队列拥塞与摸头手臂

- 改动：
  - `BehaviorRunner` 新增 `playNow()`：清空排队并立即接管；排队上限 4，防止连续交互无限堆积。
  - `VrmCueAdapter` 的场景 behavior cue 优先走 `playBehaviorNow`；`VrmController` / `VrmPoseLayer` 完成接线。
  - `setRaised` 改为强制接管：松手直接进 `behavior.land`，不再 `stop → 排队 land`。
  - `pose.react-nuzzle` 新增执行器：只写脊柱/头颈，手臂走 `HANG` 意图，修复摸头时手臂被欧拉 z 甩到侧面。
- 原因：同级/低优先级行为全部进队列，连续点击后形成长队列；松手依赖 exit→queue；摸头蹭手姿势的大臂欧拉 z 实际是侧展。
- 验证：真机松手 40ms 进 land、120ms 回 idle；连续 `playBehaviorNow` 三次队列保持 0；head-pat 手臂 `upper ≈ ±0.26,-0.97`、掌心 inward 0.94；avatar+pet 439 项通过；golden 仅 `behavior.head-pat` 更新；typecheck、行数/结构/循环门禁通过。
- 相关：`animation/behavior.ts`、`animation/adapters/vrm.ts`、`vrm/vrm-pose-layer.ts`、`vrm/vrm-controller.ts`、`script/adapters/vrm-adapter.ts`、`animation/adapters/vrm-executors.ts`。

## 2026-11-13 P5.5.20 wave/shy 接回兜底手势

- 改动：
  - `VrmController` 新增 `playMotion(id)`：内部 MOTION 一次性播放，时长取自 `MotionDefinition.durationMs`；同时让剧本 `motion` cue 对内部动作可用。
  - `tap()` 的优先级改为：触摸反应 → VRMA 手势（池 >1 条）→ 内部 `motion.wave/shy` → 程序化点头/歪头。
  - 新增 `pickMotionGesture()`；`VrmIdleOverlay` 在反应开始时清掉余兴，余兴排期也跳过反应中，避免同优先级双写。
  - 帧台账的 `idle:react` intent 现在记录真实动作 id（不再固定写 `motion.react-flinch`）。
- 排查结论：Git 基线里没有这三个 id，`motions/gestures.ts` 是未提交的新内容，未发现“引用被改坏”的痕迹；`motion.stretch-up` 是伸懒腰修复时刻意换成 `pose.stretch-cycle`，已修正两处过期注释。
- 验证：真机 `playMotion('motion.wave')` 返回 true，台账 spine/head/arms=`idle:react`、reaction=`motion.wave`、冲突 0；右手抬到肩上方（手 y 1.55 > 肩 1.25），结束后恢复 `idle:relax`；avatar+pet 437 项通过；typecheck、行数/结构/循环门禁通过。
- 说明：`wave/shy` 是“无 VRMA 手势”时的兜底；动作池 >1 条时仍优先 VRMA。`stretch-up` 保持库内容，不再接回行为。
- 相关：`performance/gesture.ts`、`vrm/vrm-controller.ts`、`vrm/vrm-pose-layer.ts`、`vrm/overlay/vrm-idle-overlay.ts`、`vrm/overlay/vrm-frame-ledger.ts`。

## 2026-11-13 P5.5.19 待机余兴手臂迁入意图表

- 改动：
  - 新增 `arms/pose-intents.ts`：双手身前/插兜/抱臂/害羞/垂臂姿势 → 手臂意图，数值来自真机世界方向采样。
  - 新增 `arms/motion-intent.ts`：`applyMotion` 在姿势/混合写完后，按采样进度插值意图并调用统一手臂求解器；未登记意图的姿势保持欧拉路径。
- 原因：余兴动作此前走欧拉手臂，手部 roll 依赖姿势基线；接回 clip 待机后需要和统一求解器一致。
- 验证：`motion.hands-front/pocket/arms-crossed/shy` 关键帧手臂世界方向与意图偏差 <0.01 rad（新增 4 项测试）；真机 hands-front 余兴方向 `leftUpper 0.65,-0.75,0.06` / `leftLower -0.13,-0.96,0.24`；avatar+pet 436 项通过；typecheck、行数/结构/循环门禁通过。
- 说明：未引用的 `motion.wave/shy/stretch-up` 仍保留原欧拉数据；如需启用再登记意图即可。
- 相关：`arms/pose-intents.ts`、`arms/motion-intent.ts`、`adapters/vrm.ts`、`__tests__/motion/arm-intents.test.ts`。

## 2026-11-13 P5.5.18 待机余兴接回 clip 待机

- 改动：
  - `VrmIdleOverlay.update` 的 `updateAccent()` 移出 `procedural` 分支：有 idle clip 时也会每 25–40s 插入一段余兴（双手身前/插兜/抱臂/靠墙/踮脚）。
  - 余兴作为 `idle:accent` claim（`FRAME_PRIORITY.accent = 12`，全身体）；余兴期间 `relaxWeight = 0`，避免被垂臂覆盖。
  - 行为接管时清空 accent 并重置余兴排期；首帧只排期不再直接 return，已有 accent 可立即应用。
- 原因：默认模型有 idle clip，`procedural=false`，余兴从未播放；即使播放，`relaxArms` 也会在之后覆盖手臂。
- 验证：真机强制 `motion.hands-front` 余兴，台账六区域均为 `idle:accent`，清除后恢复 `idle:relax`，冲突 0；手臂世界方向与 `pose.stance-hands-front` 一致；avatar+pet 432 项通过；typecheck、行数/结构/循环门禁通过。
- 说明：余兴仍是欧拉姿势，后续可按需迁入意图表；余兴结束回 anchor 后由 relax 接管。
- 相关：`vrm/overlay/vrm-idle-overlay.ts`、`vrm/overlay/vrm-frame-ledger.ts`、`vrm/vrm-pose-layer.ts`、`vrm/vrm-controller.ts`、`animation/frame/regions.ts`。

## 2026-11-13 P5.5.17 生气叉腰迁入手臂意图

- 改动：
  - `arms/intents.ts` 新增 `SCOLD_HUFF`（大臂略外张、前臂扶髋、掌心朝内下）。
  - `POSE_EXECUTORS` 新增 `pose.scold-huff`：躯干/头走姿势，手臂走统一求解器；行为轨道不再用该姿势的欧拉手臂。
- 原因：这是行为链路上最后一条纯欧拉手臂姿势；`behavior.scold-fat` 此前大臂外展约 45°，手落点依赖欧拉叠加。
- 验证：真机 `behavior.scold-fat` 双手在髋部（左 `0.13,0.87,0.01`，右 `-0.08,0.87,0.01`），肘部外张，掌心 inward 0.93；截图确认；avatar+pet 430 项通过；golden 仅 `behavior.scold-fat` 更新；typecheck、行数/结构/循环门禁通过。
- 相关：`arms/intents.ts`、`adapters/vrm-executors.ts`、`__tests__/__snapshots__/golden.test.ts.snap`。

## 2026-11-13 P5.5.16 帧计划写入前决议与拒绝后写者

- 改动：
  - 新增 `animation/frame/regions.ts`（区域/claim 共享定义）与 `animation/frame/plan.ts`（`resolveClaims` + `FramePlan`）。
  - `FrameLedger` 复用同一套决议；`VrmFrameLedger` 拆成 `beginFrame`（写入前决议）/ `allows` / `commit`。
  - `VrmController` 在待机垂臂前查询 `allows('idle:relax')`：同优先级落败的写者被拒绝，不再静默覆盖。
- 原因：台账只记录不拦截，冲突发生后画面仍由后写者决定；需要把 winner 变成写权限。
- 验证：plan 新增 5 项测试；avatar+pet 430 项通过；真机台账待机/伏案/叉腰/点击反应冲突均为 0；typecheck、行数/结构/循环门禁通过。
- 说明：当前强制的是 relax 与 behavior/react 这条同优先级路径；低优先级基础层仍按正常分层写入，由 winner 后写覆盖。
- 相关：`animation/frame/regions.ts`、`animation/frame/plan.ts`、`animation/frame/ledger.ts`、`vrm/overlay/vrm-frame-ledger.ts`、`vrm/vrm-controller.ts`。

## 2026-11-13 P5.5.15 Composer 阶段拆分

- 改动：
  - `Composer` 新增 `stageOfTrack()`：轨道只要触及手臂子树（arms/hands/fingers），统一归到 `arms`；纯躯干/腿/头轨道取各自最晚阶段。
  - `compose()` 先按 `root → legs → spine → head → arms → hands → fingers` 执行，再在每个阶段内按 priority 3→0、轨道定义顺序执行。
  - 新增 3 项测试：轨道归阶段、阶段顺序优先于 priority、同阶段 priority 顺序保持。
- 原因：原先轨道按定义顺序写骨骼，全身体态轨与手臂轨混在一起；手臂可能先于脊柱落盘，后置脊柱写入会让手臂基于旧脊柱。
- 验证：avatar+pet 425 项通过；golden 16 项未变化（当前行为集观感一致）；真机台账冲突为 0；typecheck、行数/结构/循环门禁通过。
- 说明：阶段拆分只调整执行顺序，不改变每条轨道内部的求解；同区域同优先级「拒绝后写者」仍待下一阶段。
- 相关：`animation/composer.ts`、`animation/frame/ownership.ts`、`__tests__/composer.test.ts`。

## 2026-11-13 P5.5.14 固定拓扑序第一步：阶段归属 + 掌心最后写者

- 改动：
  - 新增 `animation/frame/ownership.ts`：骨骼 → 阶段归属表（`root → legs → spine → head → arms → hands → fingers`），并断言父阶段先于子阶段。
  - `arms/solver.ts` 记录本帧掌心意图；新增 `reapplyPalms()`：呼吸/手部防穿模在后置阶段改写上臂后，用当前前臂方向重新滚腕；明确的「不滚腕」会清掉旧意图。
  - `VrmPoseLayer.applyBodyIdle` 在 `liveliness` / `handClearance` 之后调用 `reapplyPalms`，让 hand roll 成为手臂子树最后一个写者。
- 原因：呼吸与防穿模在手臂求解之后绕上臂骨轴微调，会连带旋转手骨；此前掌心的最终值不是求解器算出的目标。
- 验证：新增 ownership 4 项 + 掌心最后写者 1 项测试；avatar+pet 422 项通过；真机 8 动作掌心数据无回退（待机 inward 0.97、伏案 up -0.93、干饭 up 0.98、伸懒腰 forward 0.97）；typecheck、行数/结构/循环门禁通过。
- 说明：本阶段先强制「手部最后写」并补齐阶段归属；行为 Composer 仍未按阶段拆分写入，完整单写者强制在下一阶段。
- 相关：`animation/frame/ownership.ts`、`animation/arms/solver.ts`、`vrm/vrm-pose-layer.ts`、`animation/__tests__/frame/ownership.test.ts`、`animation/__tests__/executors/arms.test.ts`。

## 2026-11-13 P5.5.13 帧区域台账（区域所有权第一步）

- 改动：
  - 新增 `animation/frame/ledger.ts`：每帧记录 `region → owner / layer / priority / weight / intent`；同区域同优先级不同 owner 判为冲突，dev 只告警一次。
  - 新增 `animation/frame/behavior-claims.ts`：把当前行为轨道（pose/motion + mask）投影成区域 claim，不改执行。
  - 新增 `vrm/overlay/vrm-frame-ledger.ts`：接入 base clip / 行为 / 待机垂臂 / 待机余兴 / 触摸反应 / 视线叠加 / 坐姿。
  - `VrmController.update` 在行为与待机写入之后调用 `frames.record(...)`；`__vrmDebug.state().frames` 与 `controller.frameDebug` 可读。
- 原因：同一身体区域有多个写者（mixer / 行为 / 垂臂 / 叠加层），过去只靠 if 条件避让，出问题无法回答「这一帧是谁写的」。
- 验证：真机台账——待机 `leftArm/rightArm=idle:relax`，`work-focus/hands-on-hips` 全区域 `behavior:*`，tap 反应 `spine/head/arms=idle:react`，冲突均为 0；animation/vrm/script 312 项测试通过；typecheck、行数/结构/循环门禁通过。
- 说明：本阶段只记录不拦截；`winner` 尚未变成写权限，区域强制与固定拓扑序放在下一阶段。
- 相关：`animation/frame/ledger.ts`、`animation/frame/behavior-claims.ts`、`vrm/overlay/vrm-frame-ledger.ts`、`vrm/vrm-controller.ts`、`vrm/vrm-pose-layer.ts`、`vrm/vrm-debug.ts`。

## 2026-11-13 P5.5.12 统一手臂求解器与掌心轴修正

- 改动：
  - 新增 `animation/arms/intents.ts`：上臂/前臂世界方向与掌心法线集中成一张意图表（垂臂、伏案、鞠躬、叉腰、托腮、哈欠、拥抱、伸懒腰三段、干饭端碗/送口、悬空）。
  - 新增 `animation/arms/solver.ts`：唯一写「上臂方向 + 前臂方向 + 腕 roll」的入口；动作只声明意图，不再各自拼 `aimBone`/`orientPalm`。
  - 删除 `vrm.update` 之前的全局强制内扣；伏案/干饭/伸懒腰等动作的掌心按语义声明（朝下/朝上/朝前）。
  - `PALM_LOCAL` 修正为手骨局部 `-Y`（`+Y` 是手背）；此前按 `+Y` 校正会让手掌整体翻转 180°。
  - `PoseExecutor` 的 `frameYaw` 贯通到行为轨道：背对/转身时世界方向目标随身体旋转。
- 原因：全局统一朝内只适合垂臂类动作；伏案应掌心朝下、干饭朝上、伸懒腰朝前，一刀切会把正确动作改错；掌心轴符号错误让上下/内外整体反转。
- 验证：真机探针 8 动作掌心法线分量——伏案 `up=-0.93`（朝下）、干饭 `up=0.98`（朝上）、伸懒腰 `forward=0.97`（朝前）、待机/鞠躬/叉腰/拥抱 `inward≥0.9`；avatar+pet 409 项测试通过；typecheck、行数/结构/循环门禁通过；golden 15 项已更新。
- 相关：`animation/arms/intents.ts`、`animation/arms/solver.ts`、`performance/arm-relax.ts`、`adapters/vrm-executors.ts`、`adapters/vrm-gesture-arms.ts`、`adapters/vrm-arm-cycles.ts`、`animation/adapters/vrm.ts`、`vrm/vrm-pose-layer.ts`、`vrm/vrm-controller.ts`、`__tests__/executors/arms.test.ts`。

## 2026-11-12 P5.5.11 全局掌心统一与手臂求解排查

- 改动：
  - 在 `vrm.update` 之前统一执行 `orientPalmsInward()`，掌心朝身体中线；移除伏案/伸懒腰的逐动作掌心补丁。
  - 全局掌心不再由各动作各自决定，避免 fidget、crossfade、行为 pose 互相覆写。
- 排查结论：
  - `aimBone` 只对齐方向，不控制 roll；`aimArm` 只写上臂/前臂方向，手骨 roll 靠继承，导致不同动作掌心随机。
  - 逐动作 `orientPalm` 会不断新增 roll 所有者，越改越耦合；之前「每个动作单独补掌心」的经验是错误的。
  - 上臂 twist/肘平面仍无控制，抬臂/背手类动作仍可能整条手臂自转，需要后续 ArmSolver。
- 验证：8 个动作采样掌心内积均 >0.9（统一朝内）；work-rest 逐帧确认不再外翻；animation/performance/vrm/script 302 项测试通过；typecheck、行数/结构/循环门禁通过。
- 相关：`vrm/vrm-controller.ts`、`vrm/vrm-pose-layer.ts`、`adapters/vrm-gesture-arms.ts`、`adapters/vrm-arm-cycles.ts`。
- 后续修订（P5.5.12）：全局强制内扣已移除；掌心轴 `+Y` 的结论是错的（实际掌心为 `-Y`），改为统一求解器 + 逐动作意图。本条仅保留为排查过程记录，勿再照此实现。

## 2026-11-12 P5.5.10 伸懒腰掌心翻转

- 改动：`aimStretchCycle` 在抬臂过程中同步校正掌心：前平举阶段掌心朝下，垂臂/上举阶段掌心朝内。
- 原因：`aimBone` 只对齐手臂方向，手掌 roll 仍继承绑定姿态；伸懒腰抬手时掌心翻到上面。
- 验证：work-rest 34 帧采样，抬手阶段掌心朝下/朝内，不再翻掌；animation 196 + script/vrm/pet 149 项测试通过；typecheck、行数/结构/循环门禁通过。
- 相关：`adapters/vrm-arm-cycles.ts`。

## 2026-11-12 P5.5.9 手掌朝向修正

- 改动：
  - 新增 `orientPalm`：绕前臂轴滚动手掌，让掌心朝目标法线。
  - 待机/垂臂在 fidget 之后统一把掌心转向大腿（`orientHangingPalms`），避免掌背朝前。
  - `pose.lean-desk` 执行器把掌心转向桌面（向下）。
  - 周期手臂动作（干饭/伸懒腰）拆到 `vrm-arm-cycles.ts`，控制单文件行数。
- 原因：`aimBone` 只对齐骨骼方向，不控制 roll；手部 fidget 又会覆写手骨，所以伏案起手/待机时掌心朝外，看起来像手腕扭到身后。
- 验证：待机掌心法线由 ±X（朝外）变为朝大腿；work-focus 掌心朝下（dotUp ≈ -0.9）；第一帧放大截图手掌自然；animation/performance/vrm/script 302 项测试通过；typecheck、行数/结构/循环门禁通过。
- 相关：`performance/arm-relax.ts`、`adapters/vrm-gesture-arms.ts`、`adapters/vrm-arm-cycles.ts`、`vrm/vrm-pose-layer.ts`。

## 2026-11-12 P5.5.8 抓起释放兜底与点击不切换

- 改动：
  - `useRaisedGesture` 增加全局 `pointerup` / `pointercancel` 监听，指针移出命中盒或窗口跟手时也能释放悬空姿势。
  - 命中盒 `buttons === 0` 的自愈分支同步调用 `raised.release()` 与 `endInteraction()`。
- 原因：`pointerup` 丢失后 `behavior.lifted` 会一直停在 loop；它 priority 1 且 `interrupt: 'all'`，后续点击触发的行为全部排队，表现为「点击不怎么切换动作」。
- 验证：真实 pointerdown → 上移 → window pointerup 采样：`lifted → land → null`；随后 `playBehavior('behavior.hands-on-hips')` 立即接管；pet 43 项测试通过；typecheck、行数/结构/循环门禁通过。
- 相关：`stage/use-pet-raised.ts`、`pet-hit-regions.tsx`。

## 2026-11-12 P5.5.7 伏案起手手臂

- 改动：新增 `pose.lean-desk` 执行器：躯干/腿沿用 `LEAN_DESK`，手臂改为世界方向前伸目标（手落在身前桌面高度）。
- 原因：伏案 enter 第一帧双手绕到身后。原姿势的欧拉手臂叠加在帧基准（上一姿势/垂臂）上，结果依赖基准；且 x 轴实际是沿臂长 roll，不是前伸。
- 验证：work-focus 16 帧采样，起手与保持阶段双臂都在身前，不再绕后；animation 173 + script/vrm 106 项测试通过；typecheck、行数/结构/循环门禁通过。
- 相关：`adapters/vrm-gesture-arms.ts`、`adapters/vrm-executors.ts`、`poses/sitting.ts`。

## 2026-11-12 P5.5.6 伸懒腰路径与干饭手臂修复

- 改动：
  - 新增 `pose.stretch-cycle` 执行器：手臂按「垂臂 → 前平举 → 上举」路径抬落，按行为时间驱动。
  - `behavior.wake` 改用该执行器；exit 改为 `pose.gesture-hang` + `pose.idle-torso`。
  - 新增 `pose.eat-cycle` 执行器：端碗与送口改为世界方向目标，替代原来的欧拉端碗姿势。
  - `work-focus` / `scold-fat` / `head-pat` 的 exit 统一改为垂臂基准 + `pose.idle-torso`。
- 原因：
  - 伸懒腰从垂臂直接抬到正上方，欧拉会横向穿过 T-pose；世界方向接近 180° 时最短弧还会随意选轴，出现掌心朝上、手臂像扭了一下的瞬间。
  - 干饭的欧拉 `pose.eat-hold/eat-bite` 把双臂绞在胸前。
  - 多个行为 exit 仍用 `pose.idle-body`，自带的手臂欧拉会在收尾时叠出 A-pose 闪动。
- 验证：work-rest 场景逐帧采样确认 T-pose 闪帧消失，手臂从身前抬起；eat-rice 逐帧确认端碗/送口自然；animation 173 + script/vrm 106 项测试通过；typecheck、行数/结构/循环门禁通过。
- 相关：`adapters/vrm-gesture-arms.ts`、`adapters/vrm-executors.ts`、`behaviors/daily.ts`、`behaviors/touch.ts`、`behaviors/social.ts`、`poses/daily.ts`、`poses/posture.ts`。

## 2026-11-12 P5.5.5 表情多网格与动作交接过渡

- 改动：
  - `MorphExecutor` 支持同时绑定多个网格；家族精简模型 `Body_Model_up_1..N` 且 morph 名为数字时，按已校验的 binding 索引顺序绑定。
  - 交叉淡化改为等新行为权重 ≥0.95 才释放，不再 500ms 强制释放。
  - 手势 enter/loop 增加 `pose.arms-hang` 基准；一次性动作改用 `settledExit`，退出时不再重摆 `pose.bow/yawn/hug`。
  - 新增 `pose.idle-torso`（只归零躯干/腿、不写手臂），鞠躬/打哈欠/拥抱动作首尾改用它。
  - 行为结束后的垂臂 relax 权重 0.7 → 1。
- 原因：
  - 当前模型把脸部拆成 11 个 primitive 且 morph 名被导出成数字，旧执行器找不到 `Body_Model_up`，眉/嘴/脸完全不联动。
  - 交接时交叉淡化在权重约 0.53 就强制释放，手臂一帧跳回 A-pose（实测 38°），随后又被动作拉回，观感「先慢后突然飞快」。
  - `pose.idle-body` 自带手臂欧拉，与垂臂基准/目标姿势叠加导致落地和退出时手臂过转。
- 验证：真机 raw morph 索引 24/64/75 = 0.30/0.55/0.35（嘴/眉/眼联动）；hips→bow 采样最大单帧臂向变化 24.2° → 5.63°；animation/script/vrm 279 项测试通过；typecheck、行数/结构/循环门禁通过。
- 相关：`morph/executor.ts`、`adapters/vrm-morph.ts`、`adapters/vrm-crossfade.ts`、`behaviors/gestures.ts`、`poses/posture.ts`、`motions/postures.ts`、`vrm/vrm-controller.ts`。

## 2026-11-12 P5.5.4 悬空手指与落地交叉淡化修复

- 改动：
  - `pose.lift-struggle` 增加手指动画：四指共享伸缩包络（仅微小相位差），拇指用不同频率/相位独立屈伸并轻微外张；相对 `baseQuat` 写入。
  - 新增 `VrmAnimationRuntime.rememberFrame()`：每帧 mixer 写骨骼前缓存上一帧最终手臂姿势。
  - `BoneCrossFade.begin` 优先用缓存姿势作为淡化起点；`VrmController` Step 0.7 调用 `pose.rememberFrame()`。
- 原因：
  - 悬空挣扎只有四肢摆动，手指保持绑定姿态，显得僵硬。
  - 放下时 `lifted exit → land enter` 在帧内自动切换，`captureFrame` 已把手臂重置为 mixer 姿势，`begin` 读到 T-pose，导致落地首帧双手持平。
- 验证：真机逐帧采样 `behavior.land/enter` 首帧 `leftUpper=(0.258,-0.964,0.066)`（垂臂而非 T-pose）；悬空时 index/thumb 屈曲角持续变化；animation/script/vrm 共 278 项测试通过；typecheck、行数/结构/循环门禁通过。
- 相关：`adapters/vrm-gesture-arms.ts`、`adapters/vrm-crossfade.ts`、`adapters/vrm.ts`、`vrm/vrm-controller.ts`、`vrm/vrm-pose-layer.ts`、`__tests__/executors/gestures.test.ts`。

## 2026-11-12 P5.5.3 抓取动作 4 倍速

- 改动：
  - `BoneCrossFade.begin` 支持自定义淡化时长；抓取/落地 45ms，普通动作仍 180ms。
  - `behavior.lifted` enter 320→80ms（fade 120→30），exit 300→75（fade 120→30）。
  - `behavior.land` enter 320→80（fade 160→40），exit 120→30（fade 100→25）。
  - root `motion.lift-rise` 320→80ms，`motion.lift-drop` 300→75ms。
  - `pose.lift-struggle` 全部频率 ×4（主频约 1.1Hz），保持多轴多相位与幅度不变。
- 原因：抓取整体节奏偏慢；被抓属于情绪大的动作，需要即时反馈，而普通手势仍保持柔和。
- 验证：animation + script 共 243 项通过；typecheck、行数/结构/循环门禁通过；golden 快照已更新。
- 避坑：快频摆动改用更密的测试采样点（0.15s 步长），避免用 0.4s 稀疏采样评估高频曲线时出现混叠误判。
- 相关：`adapters/vrm-crossfade.ts`、`adapters/vrm.ts`、`adapters/vrm-root.ts`、`adapters/vrm-gesture-arms.ts`、`behaviors/lifted.ts`。

## 2026-11-12 P5.5.2 动作节奏与悬空挣扎

- 改动：
  - 普通手势放慢：鞠躬 2200ms、打哈欠 3000ms、拥抱 2800ms；叉腰/托腮 enter 800/900ms。
  - `PhaseDefinition` 新增 `fadeMs`，行为权重按阶段淡入淡出；普通动作 500–700ms，被拎起保持 120ms 快速反馈。
  - `pose.lift-struggle` 改为多轴、慢频、多相位摆动：手脚同时有前后（z）与左右（x）分量，避免同频正弦像正步。
  - 被拎起保持 root 固定，只做垂直上提；挣扎全部交给四肢。
  - 场景 beat 时间同步延后（鞠躬 2300、打哈欠 3100、拥抱 2900）。
- 原因：普通动作过快像「偷袭」；悬空动作只有前后摆，像练操；抓住的主体不应摇摆。
- 验证：真机按住 0.4/1.2/2.4/3.6s，四肢 x/z 均持续变化，`sceneY` 稳定；animation 171 + script 72 通过。
- 相关：`motions/postures.ts`、`behaviors/gestures.ts`、`behaviors/lifted.ts`、`adapters/vrm-gesture-arms.ts`、`contracts.ts`、`behavior.ts`、`scenes/moments.ts`。

## 2026-11-12 P5.5.1 手势执行器与切换稳定

- 改动：
  - 行为轨道支持世界方向执行器（`ComposeTrack.executor`），大臂保持自然下垂附近，小臂承担主要方向变化。
  - 新增 `BoneCrossFade`：切换动作时以上一帧手臂姿势为基准直接过渡，不先回 T/A-pose。
  - 手势退出增加 `pose.gesture-hang` 基准轨；落地 `behavior.land` 补手臂回落，修复退出/落地回 A-pose。
  - 叉腰双手 z 从 -0.2 调到 +0.08；鞠躬增加前摆，修复双手藏到身后。
  - 执行器新增 `timeMs`，loop 摆动不再被固定 `t=0` 冻结。
- 原因：欧拉大臂过度外展、行为权重 0 露绑定姿态、退出阶段无人写手臂、双手目标落到身后。
- 验证：真机逐帧采样双手 z；起手/互切/退出「双手同时在身后」帧数均为 0；golden 更新为分层人形 rest 骨架。
- 相关：`composer.ts`、`adapters/vrm-compose.ts`、`adapters/vrm-crossfade.ts`、`adapters/vrm-executors.ts`、`adapters/vrm-gesture-arms.ts`、`poses/arms.ts`、`behaviors/lifted.ts`。

## 2026-11-12 P5.5 行为与场戏扩容

- 改动：新增 `pose.bow` / `hands-on-hips` / `chin-rest` / `yawn` / `hug`，以及对应 L2 动作、L3 行为与 `moment.*` 场戏；身体单击轮换接入。
- 原因：动效库需要覆盖日常社交动作。
- 验证：动画/剧本测试通过；golden 新增行为快照。
- 遗留：当时仍走欧拉姿势，后续由 P5.5.1 改为世界方向执行器。
- 相关：`poses/daily.ts`、`motions/postures.ts`、`behaviors/gestures.ts`、`scenes/moments.ts`。
