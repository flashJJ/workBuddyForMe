# 09 剧本引擎开发细则与准备清单

> 目的：把 [08 剧本化架构](./08-script-architecture.md) 落成**可开工的规格**——先复查 3.0 计划里的冲突，再冻结契约、模块边界、运行时语义、任务拆分与验收。
> 范围：M0（剧本底座）。M1 之后的内容生产不在本文展开。
> 结论：M0 只做「现有行为的等价表达 + 单时钟调度 + 可回归」，不新增表现、不改数据库、不换渲染栈。

## 1. 复查结论：计划内的五处冲突

| 编号 | 冲突 | 定稿 |
|---|---|---|
| C1 | 01/04/06 定义 `AnimationDirector`，08 定义 `ScriptDirector`，出现两个「单调度器」 | **只保留 `ScriptDirector`**。`AnimationDirector` 降级为 `MotionKit` 内部的 body 轨道执行器，不再作为独立概念出现在新代码里；04 的优先级表原样沿用为 Director 的策略 |
| C2 | 新里程碑 M0–M5 丢掉了原 P0/P1/P2 优先级标签 | 表格补回优先级列：M0/M1/M2 = P0，M3/M4 = P1，M5 = P2 |
| C3 | 3.0 正文 4.1 写「内置原创 Live2D 雪团」，但第 3 节资产管线是「概念稿 → VRM」 | **雪团主形象定为 VRM**（与资产管线、桌宠现有能力一致）；Live2D 继续服务既有内置角色，不作为 3.0 新角色主路径 |
| C4 | 06 的 P0 还有「原位换模型 / 资源回收 / Q 版」未完成，而新 M0 只讲剧本 | M0 拆成两段：**M0a 剧本底座**（本文重点）与 **M0b 运行时补齐**（原位换模型、资源回收、Q 版），两者都算 P0 |
| C5 | 08 没写 Live2D 的能力边界，容易被理解成两套都要完整支持 | 用适配器能力矩阵约束：VRM 全量，Live2D 只保证 motion/expression/look/lip，程序化手势与姿态叠加降级为无操作 |

## 2. 术语表（冻结）

| 术语 | 定义 | 不做什么 |
|---|---|---|
| Scene | 一场可独立播放的戏，含触发、优先级、冷却、gating 与 beats | 不直接写骨骼/音频 |
| Beat | 场景内某时刻的一个 cue，`at` 为相对毫秒 | 不做条件循环 |
| Cue | 最小表现单元，绑定到轨道 | 不持有状态 |
| Track | body / face / look / voice / ui / world | body、world 独占；其余可并行 |
| Preset | 可复用的 cue 组合（数据） | 不含逻辑 |
| Director | 单时钟、门控、抢占、冷却、确定性随机 | 不认识 VRM/Live2D |
| Kit | 把 cue 映射到具体模型的适配层 | 不互调、不起定时器 |

## 3. 最终模块布局（含行数预算）

```text
packages/shared/src/schemas/script/
  scene.ts          Scene / Beat / Track / 校验         ≤150 行
  cues.ts           Cue 联合类型 + zod                  ≤180 行
  conditions.ts     Condition + evaluate(ctx)           ≤120 行
  presets.ts        Preset 引用与解析                    ≤100 行
  index.ts          barrel                              ≤20 行
  *.test.ts         契约与条件单测

apps/web/src/features/avatar/script/
  director.ts       ScriptDirector（单时钟/轨道/抢占）   ≤300 行
  recorder.ts       CueRecorder（golden/调试）           ≤120 行
  registry.ts       SceneRegistry + 触发键索引           ≤120 行
  random.ts         mulberry32 + 派生 seed               ≤60 行
  adapters/
    vrm-adapter.ts  包装 Pose/Face/Look/Motion/Voice     ≤300 行
    live2d-adapter.ts 仅 motion/expression/look/lip       ≤150 行
  scenes/
    touch.ts        摸头/长按/身体/双击/提起             ≤300 行
    ambient.ts      低语/环顾/换重心                     ≤200 行
    state.ts        睡眠/唤醒/背对/久别                  ≤200 行
  scenes.ts         内置场景注册表                       ≤80 行
```

约束：

- 每个目录直接文件 ≤ 12；单文件 ≤ 300 行（沿用现有门禁）。
- 场景内容用 **TS 常量**（编译期锁定 motion/pool/tag id）；角色包用 **JSON**（zod 校验）。
- 所有新代码从公共入口导出（`@wbfm/shared/schemas`、`@/features/avatar`），跨域只引用公开入口。

## 4. 契约定稿

### 4.1 Director API

```ts
export interface ScriptContext {
  hour: number;
  relationshipLevel: 'stranger' | 'acquaintance' | 'partner';
  mood: MotionMood;
  emotionEnabled: boolean;
  linesEnabled: boolean;
  doNotDisturb: { enabled: boolean; startHour: number; endHour: number };
  busy: boolean;          // 对话/语音/拖拽
  sleeping: boolean;
  faceAway: boolean;
  /** 确定性随机：由 director 按 sceneId + playIndex 派生 */
  random: () => number;
}

export interface ScriptDirector {
  /** 返回是否被接受（门控/冷却/优先级不满足时 false） */
  play(sceneId: string, ctx: ScriptContext): boolean;
  /** 外部打断：drag / voice_start / sleep / dispose */
  cancel(reason: 'drag' | 'voice' | 'sleep' | 'dispose', policy?: 'all' | 'ambient'): void;
  update(dt: number): void;
  /** 最近一次 cue 日志（golden/调试） */
  getLog(): readonly CueLogEntry[];
  dispose(): void;
}
```

- **每个 Avatar 实例一个 Director**（桌宠、形象栏、舞台各一个），不设全局单例。
- `update(dt)` 由现有 rAF 循环驱动，**不新开循环、不用 setTimeout**。
- `play` 的返回值用于埋点与调试，不用于业务分支。

### 4.2 Cue 表（M0 范围）

| kind | 轨道 | 参数 | 适配 |
|---|---|---|---|
| `pose` | body | `preset`, `fadeMs` | VRM：姿态叠加；Live2D：映射到 motion，缺失则忽略 |
| `gesture` | body | `gesture`, `intensity` | 仅 VRM（程序化）；Live2D 忽略 |
| `motion` | body | `motion`, `loop`, `fadeMs` | 双栈 |
| `expression` | face | `tag`, `holdMs` | 双栈 |
| `look` | look | `target`, `weight`, `holdMs` | 双栈（Live2D 用 ParamEyeBall） |
| `line` | voice | `pool`, `ms` | 双栈；只出字幕，不发声 |
| `speak` | voice | `text?`, `pool?`, `tts?` | 双栈；TTS 交给主窗队列 |
| `wait` | — | `ms` | 纯计时 |
| `branch` | — | `if`, `then`, `else` | 条件复用 `evaluate(ctx)` |

M0 **不实现**：`sound`、`effect`、`move`、`emit`（保留类型，运行时忽略并记一条 warn）。`event.fire` 继续留在旧 executor，不迁入。

### 4.3 条件

```ts
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { level: { min: 'acquaintance' | 'partner' } }
  | { hour: { from: number; to: number } }
  | { mood: MotionMood[] }
  | { flag: 'sleeping' | 'faceAway' | 'busy' | 'linesEnabled' | 'emotionEnabled' };
```

- 条件求值是纯函数（`conditions.ts`），单测覆盖跨午夜时段、关系枚举、DND。
- 复杂逻辑不得写进条件；需要时新增白名单 predicate id，由 TS 注册。

### 4.4 运行时语义（必须逐条实现）

1. **优先级**：沿用 04 —— P0 拖拽/落地，P1 触摸反应，P2 环境行为，P3 待机/呼吸；`voice/look/lip` 是叠加轨道，不占 body。
2. **抢占**：高优先级进入时低优先级 `fadeOut(0.12–0.2s)`；`interrupt: never` 的场景（落地、久别）不可被打断；被抢占的场景**不恢复**。
3. **冷却**：`max(scene.cooldownMs, trigger 冷却)`；同一 scene 连续播放不超过 2 次（防鬼畜）。
4. **门控顺序**：busy → sleeping/faceAway（环境戏）→ DND（只影响发声与台词）→ 关系 gating → 冷却 → 优先级。
5. **确定性**：seed = 会话 seed ⊕ sceneId ⊕ playIndex；同一输入重放得到同一 cue 序列。
6. **外部打断**：拖拽 cancel 非 P0；`voice_start` cancel P2/P3 但保留 P1 收尾；睡眠 cancel ambient；dispose 全 cancel。
7. **与音频队列**：voice 轨道只 enqueue，不等待播放完成；字幕与音频同帧下发，避免「先声后字」。
8. **与帧率档位**：hidden 档 `dt=0`，Director 不推进（避免恢复时补帧暴走）。
9. **与睡眠/背对**：sleeping/faceAway 期间 look/ambient 静默；唤醒/转回由状态 hook 触发 scene，不反向驱动。
10. **失败降级**：未知 sceneId/motion/pool 一律 warn + 跳过该 cue，不中断整场；连续 3 次失败自动 disable 该 scene（本次会话）。

## 5. 适配层能力矩阵

| 能力 | VRM | Live2D | 降级行为 |
|---|---|---|---|
| motion / 待机轮播 | 有（VRMA） | 有（motion group） | — |
| expression | 有 | 有 | 未知 tag 忽略 |
| look / 口型 | 有（lookAt/aa） | 有（ParamEyeBall/Mouth） | 无骨骼则忽略 |
| 程序化手势 | 有（nod/tilt/glance） | 无 | 静默忽略 |
| 姿态叠加（PoseKit） | 有 | 无 | 用 motion 近似 |
| 转身背对 | 有（scene.rotation） | 无 | 用 motion 近似或忽略 |

> 结论：M0 的验收以 VRM 为准；Live2D 只保证「不报错、动作/表情/口型可用」。

## 6. 内容与资产规则

- **Scene 存放**：内置场景在 `apps/web/.../script/scenes/*.ts`；角色包只能提供 `presets.json` + 资源，不能新增 cue 逻辑。
- **cue 白名单**：角色包只允许 `pose/gesture/motion/expression/look/line/wait`；`speak` 需内置角色卡授权。
- **i18n**：所有 `line/speak` 只能引用 pool id；lint 校验 key 存在、中英齐全、单条 ≤ 80 字。
- **资源引用**：motion/sound 必须在注册表内；禁止相对路径穿越。
- **调试**：`window.__petDebug = { scenes, current, log, seed }`（仅 dev）。

## 7. 测试与观测

| 层 | 方式 | 通过标准 |
|---|---|---|
| 契约 | zod + 类型用例 | 非法 scene/cue 被拒绝并给出路径 |
| 条件 | 纯函数单测 | 跨午夜、关系、DND、busy 全覆盖 |
| Director | fake clock + 录日志 | 抢占/冷却/不恢复/确定性各 1 组用例 |
| 迁移等价 | `CueRecorder` 对比旧 executor | 6 条内置链的 cue 序列一致（允许时间戳容差 16ms） |
| 回归 | 现有 183 文件 / 848 项 | 全绿，且新增测试 ≥ 20 项 |
| 性能 | 06 的指标 | 待机 CPU/GPU 不高于改造前，帧时间 p95 不回退 |
| 长稳 | 4h | 无定时器堆积、无内存漂移 |

CI 新增（M0.6）：`pnpm check:scenes` —— 死链、缺 i18n、未知 motion/pool、beat 超时、打断冲突。

## 8. M0 任务拆分（按依赖顺序）

| 任务 | 产出 | 依赖 | 验收 |
|---|---|---|---|
| T0.1 契约与 schema | `shared/schemas/script/*` + 单测 | — | 类型通过；5 组 schema 用例 |
| T0.2 黄金日志 harness | `CueRecorder` + fake clock | T0.1 | 可录出旧 executor 的 cue 序列 |
| T0.3 Director 骨架 | `director.ts` + `random.ts` | T0.1/T0.2 | 轨道/抢占/冷却/确定性用例通过 |
| T0.4 VRM 适配器 | `adapters/vrm-adapter.ts` | T0.3 | 现有控制器零改动、行为不变 |
| T0.5 触摸场景迁移 | `scenes/touch.ts` + 注册表 | T0.4 | 6 条链 golden 一致 |
| T0.6 环境/状态场景迁移 | `scenes/ambient.ts` / `state.ts` | T0.5 | 低语/睡眠/背对行为不变 |
| T0.7 接入与开关 | `resolveInteraction` → Director，`WBFM_PET_SCRIPT=1` | T0.5/T0.6 | 开关关闭时完全走旧路径 |
| T0.8 观测面板 | `__petDebug` + dev 面板 | T0.7 | 可查看场景/轨道/日志/seed |
| T0.9 性能与长稳 | 指标报告 | T0.7 | 达到 06 预算 |
| T0.10 文档与清理 | 04/06 术语更新、演示记录 | T0.9 | `pnpm check` 全绿 |

M0b（并行，可与 T0.x 交错）：原位换模型、资源回收审计、Q 版开关。三项都沿用 06 的验收。

## 9. 开发准备清单

- [ ] 基线：`pnpm check` 绿；web 183 文件 / 848 项、shared 38 文件 / 365 项、desktop pet 73 项全绿（记录在 M0 PR 描述里）。
- [ ] 分支：`feat/v3.0-script-engine`，M0 不合并到 `feat/v3.0-fat-fish` 之外的分支。
- [ ] 契约评审：本文 4.1–4.4 冻结后才允许写 Director 之外的文件。
- [ ] 开关：`WBFM_PET_SCRIPT=1` 才走新路径；关闭时保留旧 executor 与旧 hooks，保证可回滚。
- [ ] 目录与预算：按第 3 节建目录；每次 PR 跑 `check:lines` 与 `check:structure`。
- [ ] 测试脚手架：先落 T0.2，再写 Director（否则无法证明等价）。
- [ ] 观测：dev 下 `__petDebug` 与 Director 日志默认开启，生产关闭。
- [ ] 回滚：任一场景异常可通过开关整体回退，不需要发版。
- [ ] 不做：不新增 DB 迁移、不改 Electron 主进程契约、不动 Live2D 既有行为、不实现 `event.fire`。

## 10. 待确认（不阻塞 M0）

1. 雪团最终形态：本文按 **VRM 主路径**定稿；若产品坚持 Live2D，需要把 4.1 与资产管线一起改。
2. 二创是否允许自带 Scene（目前只允许 Preset）；M4 再定。
3. 自主台词是否引入 LLM 混合（当前 L2 本地池 + L3 proactive 分离）；M3 再定。

## 11. 里程碑映射

| 里程碑 | 优先级 | 内容 | 与本文关系 |
|---|---|---|---|
| M0a 剧本底座 | P0 | 本文 T0.1–T0.10 | 本文主体 |
| M0b 运行时补齐 | P0 | 原位换模型、资源回收、Q 版 | 与 T0.x 并行 |
| M1 角色与互动 | P0 | 雪团 VRM + 5 组动作 + 分层台词 | 场景内容第一批消费者 |
| M2 养成 | P0 | 五维状态 + 成长 gating | Scene gating 的数据来源 |
| M3 记忆/语音/决策 | P1 | Utility 决策 + 声线 + 主动说话 | 决策层接 Director |
| M4 小剧场/分享/角色包 | P1 | Scene 复用 + Preset 包 | 内容生态 |
| M5 发布 | P2 | 物料/合规/门禁 | 剧本 lint + golden 纳入 CI |

## 12. 实施状态（2026-11-10）

| 任务 | 状态 | 落地 |
|---|---|---|
| T0.1–T0.8 | 已完成 | 契约、录影、Director、VRM 适配、触摸/环境/状态场景、开关接入、`__petDebug` |
| T0.9 | 待实测 | 需要 `WBFM_PET_SCRIPT=1` 的桌面会话跑帧时间/CPU 与 4h 长稳 |
| T0.10 | 进行中 | 本节状态回填；剧本 lint/CI 门禁留到 M0.6 |

关键落地决策（对 §4 的补充，不改变契约定稿）：

1. Track 归属 `scene.ts`，`cueTrack` 由 cue kind 推导；时间轴展开外迁 `timeline.ts`，Director 保持单时钟且 ≤300 行。
2. `interaction.start/end` 继续由指针层驱动；6 条链 golden 对比忽略 interaction 观测项。
3. `expression.holdMs=0` 表示常驻表情，对应旧 executor 的 `setExpression`；其余走 `flashExpression`。
4. pose 预设新增 `sleep` / `wake` / `face-away` / `face-front`，映射 `setSleeping` / `setFaceAway`。
5. T0.7 开关先只接 VRM：Live2D 继续走旧 Resolver；Director 帧推进复用 `VrmCanvas` 现有 rAF（hidden 档冻结）。
6. `__petDebug` 先提供 console 只读快照（场景/活跃游标/日志/seed），可视化面板留到 M0.6。

基线：shared 41 文件 / 382 项、web 189 文件 / 903 项全绿；`pnpm check` 各门禁通过（并行 turbo 在低内存机器需串行执行）。
