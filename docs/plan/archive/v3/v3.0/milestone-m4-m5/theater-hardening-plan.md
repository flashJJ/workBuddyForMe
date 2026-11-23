# M4 小剧场硬化子计划：控制层 / 语音 / BGM / 剧场背景

> 状态：已完成（S0–S6 全部完成；2026-11-15）
> 范围：小剧场的演出控制、VRM 动作、语音、背景音乐、剧场背景、性能与验收
> 前置：M4 基础版已交付；当前工作区有 3 个文件超过 300 行（上一轮姿态修复未收尾），S0 先恢复门禁

## 0. 结论：要不要重写舞台控制逻辑

**不推倒重写 `StageRoot` / `useStageController`，但要补一层真正的“演出控制层”。**

当前舞台是「通用舞台壳 + 宠物渲染管线」：

- `StageDirection` 只接通了 `focus` / `speech` / `expression` / `cast`；`motion` 只更新名字牌（[stage-root.tsx](../../../../../../apps/web/src/features/stage/stage-root.tsx) 第 206 行），VRM 与 Live2D 都不消费它。
- VRM 走的是桌宠的待机/程序化层（`daiji` 动作池、`relaxArms`、待机余兴），与剧本 cue 无关；Live2D 走自己的 `idleGroup` / `tapGroup`。两套后端各自为政，所以会出现「名字牌写跑动中、角色却站着」以及手指/脚被宠物层改坏的问题。
- 剧场时间线是固定 5.2 秒定时器（`use-stage-theater.ts`），不感知台词长度。
- `useStageSpeech` 开头 `if (mode !== 'mock') return;`，所以剧场**完全没有语音**，不是配置问题。

因此正确做法是新增四个协作件，保留现有状态容器：

1. `TheaterDirector`：纯函数时间线状态机，决定「下一句何时开始」。
2. `StageMotionAdapter`：把 cue 映射成 VRM 的 `playMotion` / `playBehavior` 与 Live2D 的动作组。
3. `StageAudioDirector`：TTS、BGM、音效、音量闪避与取消。
4. `TheaterEpisode` 数据扩展：背景、BGM、音效、动作 cue、语音。

现有 `useStageTheater` 退化为 React 绑定；`StageRoot` / `useStageController` 继续负责状态、工具栏与分享卡。

## 1. 问题清单

| # | 问题 | 证据 | 影响 | 优先级 |
|---|---|---|---|---|
| 1 | 剧场无语音 | `use-stage-speech.ts` 仅 `mode === 'mock'` 才说话 | 三席只有字幕，没有演出感 | P0 |
| 2 | 无 BGM / 音效 / 闪避 | 舞台目录无音频层 | 无剧场氛围 | P0 |
| 3 | 固定 5.2 秒推进 | `THEATER_STEP_MS = 5200` | 长句被截、短句拖沓；接入语音后口型与字幕不同步 | P0 |
| 4 | `motion` 组未接线 | `apply-stage-direction.ts` 只写 `motions`，唯一消费是名字牌 | VRM/Live2D 都不按 cue 表演 | P0 |
| 5 | VRM 手指/脚被宠物层污染 | `daiji` 在 VRM0 上抬腿/内扣脚掌/屈指；`clipAnimatesArms` 曾漏判 VRMA 归一化轨道，程序化垂手叠加 | 爪状手、交叉脚；现有修复是过滤轨道 + 固定站姿的兜底 | P0 |
| 6 | 三席 VRM 性能与降级策略 | 帧率看门狗切省电档后非焦点角色变截帧 | 截到走路/半截姿势；重载/HMR 时空白或 `Application error` | P1 |
| 7 | 剧场背景只是默认渐变 | `builtin-backgrounds.ts` 的 `theater` 是 `#1b2748 → #0a0d16` | 没有幕布、地板、聚光灯；每集无法换景 | P1 |
| 8 | 布局可能超出舞台 | `heightVh = 82 * 0.92 * 1.12 * zoom(≤1.3)`；实测角色盒 126–145vh | 角色被裁切、脚被名字牌遮挡 | P1 |
| 9 | 无暂停/继续/可见性暂停 | 剧场只有上一句/下一句/重播 | 切走窗口后仍在跑；无法暂停 | P2 |
| 10 | 无音频/时间线测试 | 现有测试仅剧本数据与分享卡 | 回归时无法发现台词错位 | P1 |
| 11 | 剧场文本仅中文 | `theater-script.ts` 硬编码中文 | i18n 缺口 | P2 |
| 12 | 工作区门禁红 | `vrm-pose-layer` 318 行、`vrm-motion-mixer` 305 行、`vrm-controller` 301 行；`vrm-stage-stance.ts` 已建未接线 | `pnpm check:lines` 失败 | P0 |

## 2. 目标与非目标

**目标**

- 每句台词有语音（受设置开关约束）与口型，语音结束才推进；TTS 不可用时按文本长度兜底。
- 每集可有 BGM 与音效；说话时 BGM 自动闪避，可静音/调音量，退出或暂停即停。
- 剧场有真正的舞台背景（幕布、地板、聚光灯），并支持每集指定背景。
- cue 能驱动 VRM 与 Live2D 的身体动作，不再只改名字牌；手指与脚保持自然。
- 三席 VRM 在常见窗口尺寸下稳定、不裁切、不出现长时间空白。
- 导演时间线、音频闪避与动作映射有单测。

**非目标**

- 不重写 StageRoot / 通用舞台控制器，不影响 mock / run / meeting 三种既有模式。
- 不新增 TTS 引擎，不引入云端音频。
- 不做自由视角 3D 剧场、不做用户上传 BGM（可作为后续）。
- 不改变分享卡“本机截图”的实现。

## 3. 目标架构

```text
TheaterEpisode（数据：cast / lines / background / bgm / sfx）
        │
        ▼
TheaterDirector（纯状态机：cue → speaking → gap → next）
        ├── StageMotionAdapter ──→ VRM playMotion / playBehavior
        │                         └→ Live2D 动作组
        ├── StageAudioDirector ──→ TTS（按角色声线）→ 口型电平
        │                         ├→ BGM loop / fade / ducking
        │                         └→ SFX
        └── UI 状态（index / playing / share）
```

### 3.1 数据契约

`TheaterLine` 增加可选演出提示（不破坏现有 6 句）：

```ts
interface TheaterLine {
  slot: StageSlot;
  text: string;
  expression: ExpressionTag;
  motion: StageMotionGroup;      // 保留：Live2D 兜底语义
  motionId?: string;             // 例如 motion.nod / motion.wave
  behaviorId?: string;           // 例如 behavior.chin-rest
  pauseMs?: number;              // 句末留白
  sfx?: string;                  // 例如 page-turn
}
```

`TheaterEpisode` 增加：

```ts
interface TheaterEpisode {
  id: string;
  title: string;
  cast: StageCastMember[];
  lines: TheaterLine[];
  backgroundId?: string;   // 剧场内置背景
  bgm?: string;            // 背景音乐 id / 静态资源
  ambience?: string;       // 环境音（可选）
  curtain?: boolean;       // 开场/收场幕布
}
```

### 3.2 导演时间线

`TheaterDirector` 是纯函数状态机，输入事件（`start` / `lineStarted` / `audioEnded` / `next` / `prev` / `pause` / `resume` / `skip`），输出当前 cue 与下一状态。时长由外部注入：

- 有语音：`max(1800ms, TTS 播放时长 + 350ms)`；
- 无语音/失败：`clamp(文本长度 × 180ms, 1600ms, 12000ms)`；
- `pauseMs` 追加到句末。

这样语速、静音、TTS 失败都不会让字幕与口型错位。

### 3.3 动作映射

第一版只接稳定、低风险的 cue：

| StageMotionGroup | VRM | Live2D |
|---|---|---|
| `idle` | 无额外动作，保持舞台待机 | idle 动作组 |
| `listening` | `motion.glance` / 轻微头部转向说话者 | idle 组 + 表情 |
| `thinking` | `behavior.chin-rest`（存在则用，否则 `motion.tilt`） | idle 组 |
| `working` | `motion.nod` / `motion.hands-front`（按台词配置） | tap 组 |
| 台词显式 cue | `motionId` / `behaviorId` 优先 | 对应动作组或忽略 |

所有 cue 都先查动作库是否存在，不存在静默降级，不阻断台词。

### 3.4 音频

- TTS：复用 `/api/voice/tts` 与唯一播放队列；每个角色用自己的 `avatarModelId` 取 sid（雪团 18 / 冉卡露丽 32 / 菲比 3）。
- 尊重 `ttsEnabled`：关闭时只走字幕兜底，不弹错误。
- BGM：单实例 `<audio loop>` 或 WebAudio，进入剧场淡入、退出淡出；说话时 duck 到 30%，结束后恢复。
- 音效：幕布、翻页、聚光灯等短音效走独立低延迟通道。
- 浏览器自动播放限制：第一次点击「开始演出」后才启动音频；Electron 可直接启动。
- 跳过/上一句/关闭/切后台：立即取消 TTS、停 BGM 或压到 0。

### 3.5 剧场背景

- 新增内置背景：幕布（开/合）、木质地板、暖色聚光灯、暗角；默认使用「幕布 + 聚光灯」。
- 聚光灯跟随 `focus`，非焦点角色压暗；名字牌与字幕保持可读。
- 分享卡截图包含当前背景；每集可覆盖 `backgroundId`。
- 素材自制或 CC0，登记到 `ASSETS-LICENSE.md`。

## 4. 子计划

### S0 门禁清理与基线（先做）

- 完成 `VrmStageStance` 抽离（文件已创建，接线被中断），把 `vrm-pose-layer` / `vrm-motion-mixer` / `vrm-controller` 收回 300 行内。
- 确认现有舞台修复不回退：内置待机、轨道过滤、手臂动画判定、固定站姿。
- 录一张三席基线截图/GIF 作为后续对照。
- 出口：`pnpm check:lines`、typecheck、VRM/舞台单测全绿。

### S1 控制层与动作映射

- 新增 `theater/theater-director.ts` + 单测：固定时长的 5.2s 逻辑替换为可注入时长；支持暂停/继续/上一句/下一句/循环。
- `use-stage-theater.ts` 只做 React 绑定，不再自己写 timer。
- 新增 `theater/stage-motion-adapter.ts` + 单测：cue → VRM / Live2D 动作映射；不存在的动作降级。
- `stage-actor.tsx` / `AvatarCanvasRouter` 增加统一的 stage controller 句柄（暴露 `playMotion` / `playBehavior` / `setExpression`）。
- `theater-script.ts` 为 6 句补 `motionId` / `behaviorId`（可选），并保留 `motion` 兜底。
- 名字牌不再显示与 VRM 实际动作无关的「跑动中」文案，或改为显示当前 cue。
- 出口：每句都有可见动作；三席手指/脚自然；上一句/下一句/暂停可用。

### S2 语音与 BGM

- `use-stage-speech.ts` 去掉 `mode === 'mock'` 限制，改为 `speakLine`；返回播放时长，失败回退文本估算。
- 新增 `theater/use-theater-audio.ts`（或 `stage-audio-director.ts`）：TTS 队列、BGM、音效、ducking、静音、音量。
- `TheaterEpisode` 增加 `bgm` / `ambience` / `sfx`；新增默认剧场 BGM 资源（自制或 CC0）。
- 工具栏/剧场区增加播放/暂停、静音、音量；分享卡不受影响。
- 跳过/上一句/关闭立即取消语音与 BGM。
- 单测：TTS 成功/失败/取消；时长回退；ducking 纯函数；BGM 状态机。
- 出口：真机三席有声、BGM 正常、说话时 BGM 自动降低、静音即时生效。

### S3 剧场背景与视觉

- 新增内置剧场背景组件（幕布/地板/聚光灯/暗角），支持 `backgroundId` 与开场/收场幕布。
- 聚光灯跟随焦点；背景与角色滤镜不冲突。
- 分享卡包含当前背景。
- 素材许可登记。
- 出口：进入剧场有明确舞台感；切换台词时焦点光效自然；截图分享包含背景。

### S4 性能与稳定性

- 三席 VRM：预加载 + 加载幕布/进度；模型就绪后再开演；单角色失败可降级为立绘。
- 剧场专用性能策略：不因省电档把非焦点角色截成半截姿势；优先 30fps 全 live 或「焦点 live + 干净立绘」。
- 布局安全区：角色盒高度上限、脚底与名字牌不重叠；在 1024×640 / 1280×720 / 1440×900 验。
- 窗口隐藏暂停时间线与音频；重新可见恢复。
- 出口：三席稳定、无裁切、无长时间空白；切后台不继续播放。

### S5 验收与门禁

- 单测：导演状态机、动作映射、音频回退、分享卡、剧本数据。
- 真机：三席语音、BGM、ducking、静音、暂停、上一句/下一句、背景、PNG 导出。
- 门禁：typecheck、lint、`check:lines`、`check:structure`、`check:cycles`、`check:ascii`、`check:scenes`。
- 文档：更新 M4/M5 发布说明、progress-log 与开发指南。

**完成记录（2026-11-15）**

- 新增单测 3 文件 15 项，剧场域合计 7 文件 34 项：
  - `use-stage-theater.test.ts`（5）：开演先换 cast、按句派发 focus/speech/expression/motion、就绪后按句长推进、暂停停止推进/恢复继续、上一句/下一句循环与重播、语音播放期间保持（含 15s 上限兜底）。
  - `use-theater-audio.test.ts`（5）：就绪且播放才起 BGM 与合成当前句、说话 duck、暂停停声恢复补播、未就绪不开口、静音切换、自动播放拦截时首次点击只解锁、首次手势解锁与切后台停声/回前台补播。
  - `theater-bgm.test.ts`（5）：无 WebAudio 安全返回、suspended 拦截后解锁启动且不重建振荡器、主增益 0.055 / duck 0.35 / mute 与 stop 归零、9s 平滑换和弦与 stop 淡出、dispose 关闭上下文并可重建。
- 补齐控制入口：工具栏此前未接线 `toggle`，新增「暂停/继续」按钮（`stage-theater-toggle`）与中英文词条，暂停后时间线、语音与 BGM 同时停止。
- 真机（Playwright 1440×900，`/stage?stage=play`，Next dev 127.0.0.1:42337）：
  - 三席 3/3 就绪后幕布开启（本次约 10s），4 个画布、三张名字牌（冉卡露丽 / 雪团 / 菲比）与幕布/地板/聚光灯/暗角四层背景齐全。
  - 语音：真实 `/api/voice/tts` 返回 200；三句分别以 speakerId 18 / 32 / 3 合成（雪团 / 冉卡露丽 / 菲比）；切句产生的 `ERR_ABORTED` 均为主动取消，控制台无错误、`/vrm/` 无失败请求。
  - BGM：WebAudio 主增益 0.055 起播，说话期间 duck 到 0.35，语音结束恢复 1；静音按钮切换为 0 / 0.055，文案「背景音 开/关」同步。
  - 时间线：12s 内由 2/6 推进到 4/6；暂停后 8s 停在 4/6，继续后恢复推进；下一句 4→5、上一句 5→4。
  - 背景与分享卡：幕布/聚光灯/地板均可见；分享卡展示标题、日期、席位、当前台词与今日数据，浏览器裸访保存 PNG 时按预期提示「截图需在桌面端舞台窗口使用」（桌面端截图链路未改动）。
- 门禁（根目录）：`pnpm typecheck` 14 tasks 通过；`pnpm lint` 8 包 0 error（28 条存量 warning）；`check:lines` 全部 ≤300 行；`check:structure` 通过（`stage/` 21 个直接文件未增长）；`check:cycles` 8 个存量 SCC；`check:ascii` 769 个 Markdown 通过；`check:scenes` 6 文件 37 项通过。
- 文档：发布说明、progress-log 与开发指南已补剧场硬化与验收口径。

**补强（2026-11-15）**

- 表情强度端到端：`StageDirection.expression` 增加可选 `intensity`（1/2/3，缺省 2）；舞台控制器新增 `expressionIntensities` 并随 cast 重置；`StageActor → AvatarCanvasRouter → VrmCanvas → VrmSession` 全链透传，KK morph 组合与标准 preset 都按强度生效；剧场台词显式标注 3（第 2 句）与 1（第 6 句）。新增 `expression-intensity.test.ts`（3 项），真机读 `data-expression-intensity` 确认 2 → 3 → 1 切换无错误。
- 桌面端 PNG 复验：用 Playwright `_electron` 启动桌面壳，主进程替换保存对话框后经分享卡「保存 PNG」写出 2561×1601 PNG（1.05MB），toast「截图已保存」、UI 正常恢复，主进程日志无错误。
- 短音效：新增 `theater-sfx.ts`（WebAudio 合成，无外部素材）——开场幕布噪声缓升、换句短促提示音；与 BGM 共用静音开关，自动播放拦截时静默跳过。新增 `theater-sfx.test.ts`（4 项）与音频编排断言；真机确认幕布 buffer ×1、换句振荡器 +1、静音后 +0。
- 多集与 i18n：新增第二集 `morning-drill`（聚光灯背景，可与幕布集切换）；`TheaterEpisode.titleEn` / `TheaterLine.textEn` 提供英文，`localizeTheaterEpisode()` 按 locale 替换，舞台根随 `useI18n().locale` 重算。真机 `?ep=morning-drill` 验证角标 1/6、聚光灯与地板齐全。
- 剧场测试合计 9 文件 45 项；typecheck 14 tasks、行数、结构检查通过。

**体验扩展（2026-11-15）**

- 角色相对位置朝向：`stageFacingYaw()` 按同台角色 x 坐标计算面向其他人的重心；左侧约 +19.5°、右侧 −19.5°、中间正向，拖拽改站位后自动重算。`VrmPoseLayer` 增加平滑朝向偏移（与转身/微摆叠加），经 `VrmController.setStageFacing` → `VrmCanvas` → `StageActor` 接到舞台；真机截图确认左右角色整体向内、站姿自然。
- 剧集与幕：剧集数据拆到 `theater/episodes/`，新增 `TheaterAct`（半开区间 `[from,to)`）与 `genres`；现有 2 集补幕，新增《办公室小剧场 · 提案夜》《雨夜小剧场 · 等伞》，共 4 集 24 句。`theaterActAt/BackdropAt/MoodAt/GenreAt` 负责幕推导；轮播角标显示「幕名 · 第 n/N 句」。
- 类型标签与配乐：`comedy / slice-of-life / tragedy / mystery` 映射到 `playful / warm / melancholy / tense` 四套和弦进行；`TheaterBgm.setMood()` 运行中平滑换和弦并调整换和弦周期；换句音效按类型标签选择音高（喜剧高、悲剧低、悬疑轻）。幕可单独覆盖背景、配乐与类型。
- 研究结论（落地取舍）：
  - 舞台调度上，演员之间的视线与「开放/3/4 正面」比完全侧对更自然，所以采用小角度整体内转 + 保留正面可读性，而不是 90° 侧身。
  - 配乐继续用 WebAudio 合成，避免引入第三方音频许可与包体；外部素材接入规则写入 `ASSETS-LICENSE.md`（Pixabay/FMA/Musopen 逐曲核验；豆包 App 输出仅个人使用，不进入发布版）。
- 验证：`theater-script.test.ts` 覆盖 4 集幕区间连续、背景/配乐/类型推导与英文幕名；`theater-bgm.test.ts` 覆盖情绪切换与换和弦周期；`theater-sfx.test.ts` 覆盖类型音色；真机 proposal-night 第 1 幕 → 第 2 幕确认角标、幕布背景与配乐频率切换，无控制台错误。剧场 10 文件 57 项、布局 8 项通过。

## 5. 文件影响面

| 文件 | 动作 |
|---|---|
| `stage/theater/theater-script.ts` | 扩展 line/episode 字段 |
| `stage/theater/theater-director.ts` | 新增纯状态机 |
| `stage/theater/stage-motion-adapter.ts` | 新增 cue → VRM/Live2D 映射 |
| `stage/theater/use-stage-theater.ts` | 改为绑定 director |
| `stage/theater/use-theater-audio.ts` | 新增 TTS/BGM/SFX |
| `stage/voice/use-stage-speech.ts` | 支持所有舞台模式 |
| `stage/stage-actor.tsx` / `avatar-canvas-router.tsx` | 统一 stage controller 接口 |
| `vrm/vrm-canvas.tsx` / `vrm-controller.ts` | 暴露 playMotion/playBehavior 给舞台 |
| `stage/stage-background.tsx` / `builtin-backgrounds.ts` | 剧场背景与幕布 |
| `public/audio/theater/*` + `ASSETS-LICENSE.md` | BGM/音效与许可 |
| `docs/plan/archive/v3/v3.0/milestone-m4-m5/*` | 验收与发布记录 |

## 6. 风险与取舍

- **VRM0 轴向差异**：不直接改轨道名，统一走 humanoid 节点映射；动作不存在时降级。
- **TTS 延迟**：首句先出字幕，语音到达后补播；下一句可预取。
- **三席 VRM 性能**：优先保证「焦点角色 live」，非焦点用干净立绘，而不是截到坏姿势。
- **BGM 版权**：只用自制或 CC0，登记许可。
- **避免过度工程**：第一版只做 1 集、1 套背景、1 首 BGM、少量 cue；跑通后再扩容。

## 7. 当前工作区状态

- S0 已完成：`vrm-pose-layer.ts` 299 行、`vrm-motion-mixer.ts` 298 行、`vrm-controller.ts` 300 行；`check:lines`、typecheck、舞台/VRM 45 个单测全部通过。
- 姿态修复已包含：舞台只加载内置 `daiji`、剔除腿/脚/趾/指轨道、关闭待机余兴、固定 5° 外旋站姿、修正 VRMA 归一化轨道的手臂动画判定。
- 省电档不再卸载 VRM：`StageActor` 非发言者改为慢速档 `frameMode='slow'`（8fps）而不是 `hidden`；模型与画布常驻，换发言者时不会重新请求/解析 VRM。注意：WebGL 默认不保留 drawingBuffer，完全停渲染会让非焦点角色画布变透明，真机截图已确认，故必须保留最低刷新。同时移除已废弃的 `captureDataUrl` 截帧链路。
- S1 已完成：新增 `stage-motion-adapter.ts`（只映射头/颈安全动作：点头/双点头/歪头/瞥视/摇头/环顾）与 `StageMotionCue`；台词可配 `motionId`/`behaviorId`，未登记动作静默回落分组默认；只有发言者收到 cue，模型异步就绪后补播。VRM 走剧本动作槽；Live2D 共享层新增 `playCue`，统一走模型 Tap 组，模型未加载时排队、加载完成后补播。舞台模式同时关闭手指 fidget，手指只保留 daiji 腕姿。
- S2 第一版已完成：每句按角色声线走 `/api/voice/tts`；合成期间不推进台词；新增 WebAudio 合成 BGM（淡入/淡出、说话 duck 35%、静音开关、首次手势解锁自动播放）；VRM 口型改用真实播放电平。
- S3 已完成：新增 `TheaterBackdrop`（纯 CSS 侧幕/檐幕、后墙暖光、聚光灯与地面光池、木地板、背景暗角），聚光灯按当前发言者平滑平移并跟随自定义站位；`TheaterEpisode.backdrop` 支持 `curtain / spotlight / none`；背景纳入舞台截图。无新增图片素材，许可清单已登记。
- S4 已完成：新增三席就绪度统计与加载幕布（进度 + 45s 兜底）；模型就绪前时间线不推进、不发声；剧场进入时创建 VRM preload link，`/vrm/models/*` 增加浏览器缓存头；窗口隐藏暂停时间线并停声，回前台重新计时并补播当前句。真机验证：幕布约 1.4s 出现、约 23s 后关闭，关闭前台词不前进。
- S6 已完成（资产压缩 + 表情扩展）：
  - 新增 `apps/web/scripts/optimize-vrm.mjs`：把 morph target 的 POSITION 转为 glTF sparse accessor。三席 24–26MB → 11–13MB（-51%~-54%，morph 数据 14.35MB → 1.26MB），118 个表情、名称、索引与 VRM 绑定全部保留；回读校验逐顶点一致（误差 < 1e-7）。
  - 原始模型归档到 `apps/web/assets-src/vrm/`（gitignore，不入库）；`ASSETS-LICENSE.md` 与模型目录 `LICENSE.md` 增加修改说明。
  - 新增 `kk-expression-catalog.ts`（118 个 morph 的部位/语义组/强度/眼睑状态目录）、`kk-expression-presets.ts`（8 个表情 × 3 档强度组合）、`kk-face-driver.ts`（按 morph 名称直接驱动）。
  - VRM 表情层改为：KK 模型（三席内置）走 118 morph 组合，其他模型继续走 VRM 标准 preset；修复 `surprise` / `smirk` 在 VRM 上落到不存在的 `surprised` 而空操作的问题。
  - `VrmController.setExpression(tag, intensity?)` 支持 1/2/3 三档，默认 2。
  - 真机：优化前首次加载幕布约 23s；优化后约 18s，二次进入命中缓存接近即时；preload link 补 `crossOrigin` 后模型请求由 6 次降到 3 次；三席表情随台词切换正常，无页面错误。
- 已知限制：首次解析仍约 18s（几何与贴图上传占主导，sparse 主要省体积）；几何量化可作为下一步。
- 贴图清单：`scripts/inspect-vrm-textures.mjs` 生成 `vrm-texture-inventory.md`（逐张格式/尺寸/alpha/材质通道/风险分组）。结论：三席 150 张贴图 16.71MB，无 alpha 使用或可丢 alpha 的 albedo 约 14.6MB，需保留 alpha 2.08MB；三席均无法线/matcap 贴图。
- 贴图重编码已落地（`optimize-vrm.mjs` 默认执行，`--no-textures` 可回退）：贴图 16.71MB → 3.62MB（feibi 1.92 / rankaluli 1.04 / xuetuan 0.66）；三模型原始 74.75MB、sparse 后 35.5MB，现 22.29MB（feibi 7.01 / rankaluli 6.00 / xuetuan 9.28）。策略：无 alpha 使用的 albedo → 有损 WebP q90 并丢 alpha；alpha 被 MASK/BLEND 使用（五官 cutout 与内嵌 data URI）→ 无损 WebP；法线/matcap/mask → 保留原图。每张编码后校验「必须变小 + 全分辨率 RGB MAE ≤ 6」，否则保留原图；3 张极小图因无收益保留。data URI 已全部转 bufferView（uri 0）。
- 验证：输出回读确认 morph 名称/数量/VRM 绑定不变、150 张贴图全部可解码；`check:lines`、`check:structure` 通过；Playwright 打开 `/stage?stage=play` 三席正常渲染、无控制台错误、无 `/vrm/` 请求失败；与「仅 sparse」版本同区域 A/B 截图无可辨差异（头发原有细纹在两版一致）。
- S5 已完成（验收与门禁）：新增导演/音频/BGM 3 个测试文件 15 项，剧场域 7 文件 34 项；工具栏补「暂停/继续」并接上 `toggle`；真机确认三席语音（speakerId 18/32/3）、BGM duck 0.35、静音、暂停、上一句/下一句、剧场背景与分享卡；全套门禁（typecheck / lint / lines / structure / cycles / ascii / scenes）通过。
- S5 补强已完成：表情强度全链透传、剧场短音效、第二集与英文台词、桌面端 PNG 导出复验；剧场测试 9 文件 45 项，详见 S5「补强（2026-11-15）」。
- 细节见 S5「完成记录（2026-11-15）」；已知限制：首次解析仍约 18s（几何与贴图上传占主导）与几何量化留待后续。
- 所有改动未提交。
