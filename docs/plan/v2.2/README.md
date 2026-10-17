# v2.2 方案：有手感——桌宠交互反馈升级（动画段、状态驱动与拖拽物理）

> 主题一句话：**让桌宠的每一次交互都有「形状」**——按住是有过程的、松手是有后坐力的、待机动作是跟着心情走的。
>
> 生效口径：**策略通用 + 执行 VRM 优先**（见第 2 节）。与后端无关的手势、门控、物理与分组查找两个后端同时受益；需要动作模型配合的段调度与状态分档先落 3D VRM，2D Live2D 保留现状、契约零改动。
>
> 参考对象：开源虚拟桌宠模拟器 VPet（`e:\code\github\VPet-main`，C#/WPF）。借鉴只取**机制**，不搬实现（它是 2D 帧动画体系，我们是 3D 骨骼动画）。逐条判定见 [01-VPet借鉴分析.md](01-VPet借鉴分析.md)。
>
> 契约冻结稿：[02-动作段与动画图契约.md](02-动作段与动画图契约.md)（M0 已落地：动作段 / 情绪档位 / 关系门槛 + v033 纯加法迁移）。

## 1. 现状与痛点

v2.1 把交互管道收口成「归一化 → 纯函数门控 → ActionExecutor → TriggerBus」四段，形象也从「一段待机动画」变成「动作池 + 定时随机轮播 + 点击播一次性动作」。跑通之后，真实的「手感」缺口暴露得很清楚：

| 现象 | 根因（v2.1 的真实边界） |
|---|---|
| 按住不放和点一下，反馈只差一次表情 | 交互状态机有三段式阶段（`start/loop/end`），但动作层只有「整段 clip 播一次」，阶段信息没有下传给播放层 |
| 待机动作轮流播，但和「它现在什么心情」无关 | 动作池的挑选是纯随机（`rotateIdleMotion` 随机挑一个 ≠ 当前的），没有任何状态维度 |
| 拖拽只有位移，松手就停住 | 桌面壳的拖拽桥只有 `dragBegin/dragTo/dragEnd` 三个动作，没有速度采样、惯性与贴边 |
| 手势只有单击与长按 | 事件契约里已有双击/滑动/抬起，解析器未覆盖；双击当前是「回主窗」的窗口行为 |
| 关掉情绪系统后，交互反馈没有任何区别 | `ResolverContext.emotionEnabled` 已传入，但动作链没有按它分化 |

一句话概括：**管道是通的，但反馈是扁平的。**

## 2. 后端作用域：策略通用，执行 VRM 优先

桌宠有两套渲染后端（[avatar-canvas-router.tsx](../../../apps/web/src/features/avatar/avatar-canvas-router.tsx) 按 `vrm:` 前缀分流），而两者的**动作模型根本不同**：

- **VRM（3D 骨骼）**：动作是外部导入的 VRMA，一段就是一段 clip，可以自由拼接、按池调度——v2.1 的动作池、轮播与取景采样都在这一侧。
- **Live2D（2D 资产）**：动作是模型文件里固化的 motion group（现有 5 个内置模型只有 `Idle` 与 `TapBody` 两组，见 [avatar-models.ts](../../../apps/web/src/features/avatar/avatar-models.ts)），每个 motion 自带 loop 标记与淡入淡出；控制器已用「每 7–14 秒、安静时播 idle 组内随机动作」实现了 2D 版的随机待机（[live2d-controller.ts](../../../apps/web/src/features/avatar/live2d-controller.ts)），但**没有三段式交互状态机**——`startInteraction` / `endInteraction` 只有 VRM 侧实现。

因此本版逐条划定作用域：

| 条目 | 落点 | Live2D | VRM |
|---|---|---|---|
| P0-3 拖拽惯性 + 贴边回正 | 桌面壳主进程 + 命中盒 | **通用** | **通用** |
| P1-1 门控 / 动画图配置化 | shared 纯函数 + ActionExecutor | **通用** | **通用** |
| P1-2 手势补齐（双击 / 滑动） | 命中盒 `pet-hit-regions` | **通用** | **通用** |
| P0-2 状态驱动的**策略**（档位分组 + 向下兼容查找） | shared 纯函数 | **通用**（候选集来自 motion group） | **通用**（候选集来自动作池） |
| P0-2 状态驱动的**候选集提供** | 控制器 | 需另做：按状态切 motion group（要模型资源配合） | 动作池分组即可 |
| P0-1 动作段模型（A/B/C 段调度） | 播放层 | 不适用：一个 motion 自带 loop 与 fade，没有「一段拆三段」的模型 | **本版落地** |
| P1-3 按住维持的持续语义 | 播放层 | 不适用（同上） | **本版落地** |
| P2-1 心情档位过渡动画 | 播放层 | 不适用 | **本版落地** |

**兼容性保证**：本版**不删不改** `ControllerLike` 契约（`startInteraction` / `endInteraction` 在 [action-executor.ts](../../../apps/web/src/features/interaction/action-executor.ts) 里是可选调用），新增能力只在 VRM 侧接线——**选定 Live2D 形象的用户，行为与本版之前完全一致**。

**为什么 2D 不做同等效果**：Live2D 的动作是资产驱动的，分组与 loop 标记固化在 Cubism 模型文件里。要做到状态分档待机或长按维持，必须重导出内置模型的 Cubism 工程、新增 `Idle_Happy` 之类分组并准备带 loop 的 motion——**成本主要在美术资源而不是代码**，因此顺延。

## 3. 功能清单

### P0 必做

**P0-1 动作段模型：一个动作 = 入场 / 循环 / 退场（仅 VRM）**

- 用户故事：我按住桌宠的头不放，它先「抬手」，然后一直保持被摸的姿态轻轻晃，我松手后它「放下手」回到待机。
- 验收：长按头部收到 `interaction.loop` 时，播放层能停在循环段并持续抖动/加深；松手后播退场段再回待机；单击仍走一次性整段。
- 技术要点：新契约 `MotionSegment = 'A_Start' | 'B_Loop' | 'C_End' | 'Single'`（对齐 VPet 的 `AnimatType`）。**VRM 侧**播放层 `MotionMixer` 从「播一段 clip」升级为「调度一个动作条目」：`A` 播完自动转 `B`（`LoopRepeat`），`B` 收到 `setContinue` 延长，`C` 播完 `finished` 回待机。动作条目缺段时按顺序回退（缺 A 直接进 B，缺 C 直接回待机）。Live2D 侧不适用——motion 自带的 loop 与淡入淡出已覆盖同一语义，故不引入新模型。
- 导入侧：用户导入的 VRMA 默认只有一整段，按 `Single` 处理（等价于「整段即循环段」）；内置动作由我们提供三段式。**不强制用户拆段**，拆段是可选能力。
- 边界：`startInteraction` / `endInteraction` 保持可选调用，Live2D 控制器不实现即自然跳过。

**P0-2 状态驱动的待机动作（策略通用 / 候选集 VRM 优先）**

- 用户故事：它今天心情好，待机动作就偏活跃；心情差就偏安静；不熟的时候不会做太亲昵的动作。
- 验收：动作池按「情绪档位 + 关系等级」分组；命中分组优先，未命中时**向下兼容回退**（更差的情绪档位也能播），绝不出现「没有可播动作」。
- 技术要点：借鉴 VPet 的 `ModeType`（Happy/Nomal/PoorCondition/Ill）与 `FindGraph` 的兼容顺序——精确匹配 → 向下兼容 → 向上兼容 → 任意非 Ill。**分组与查找策略做成 shared 纯函数**（两后端可共用、可单测）；我们映射为：情绪档位（已有情绪状态机的输出）+ 关系等级（已有关系演算输出）。挑不到就回落 `Default` 组。
- 边界：**候选集由各后端自己提供**——VRM 侧按动作条目的档位分组（内置动作永远在池里，兜底天然成立）；Live2D 侧若要跟进，需先按状态拆出新的 motion group（见第 2 节，属资源成本，本版不做）。

**P0-3 拖拽物理与贴边回正（通用）**

- 用户故事：我把桌宠甩出去，它会带着惯性滑一段再停下；拖到屏幕边缘附近松手，它会自己贴到边上。
- 验收：拖拽过程中以固定频率采样指针位置得到速度；松手后窗口按速度继续移动并受阻尼衰减；接近屏幕边缘（阈值内）时自动回正到边缘。切换 2D / 3D 形象后手感一致。
- 技术要点：速度采样与阻尼在桌面壳主进程做（渲染进程只上报拖拽事件与最终速度），窗口位置逐帧 `setPosition`，频率上限 60Hz，移动中命中区判定沿用现有纯函数。贴边阈值与判定口径对齐 VPet 的 `Trigger*`/`Check*` 双层判定（能否开始 vs 能否继续）——**进入阈值才开始贴边，中途超出维持阈值就放弃贴边**，避免在临界点上抖。
- 边界：这条完全落在窗口层，与形象后端无关，2D 与 3D 同款生效。

### P1 争取

**P1-1 交互动画图配置化（通用）**：把现在硬编码的 `区域::手势 → 动作链` 表升级为「动画图条目 + 条件（等级/时段/情绪）」的数据配置，同键多种状态各自指名动作条目。风险：配置膨胀失控，需要保持「查不到就返回空」的既有语义。配置只描述「选哪个动作条目」，不描述后端如何播放——因此两后端共用一份配置，具体动作条目由各自的候选集提供。

**P1-2 手势补齐（通用）**：双击（角色动作，与「回主窗」的窗口行为分开：单击区双击回主窗保留在头部盒边缘，角色双击落在角色身上）；滑动（甩出去 = P0-3 的惯性入口）。手势来自共享命中盒，两后端同款生效。

**P1-3 反馈的持续语义（仅 VRM）**：`interaction.loop` 期间按持续时间加深呼吸/抖动幅度（v2.1 已有呼吸加深的雏形，把它挪到循环段上）。依赖 P0-1 的段调度，故只落 VRM。

### P2 留白

**P2-1 状态过渡动画（仅 VRM）**：情绪档位变化时播一次过渡段（借鉴 VPet 的 `Switch_Up/Switch_Down`），避免「心情突然变了但形象毫无过渡」。

**P2-2 事件链接线（通用）**：`InteractionEvent` 里的 context/system/relationship 三类事件目前解析器不处理（v2.1 遗留），接上后主动关怀与感知层才能真正驱动表演。链路在 shared 与执行器，两后端共用。

## 4. 架构影响

| 层 | 变化 | 后端 |
|---|---|---|
| shared | 新增动作段契约（`MotionSegment`）与动画图条目类型；`interaction-resolvers` 增加 `interaction.loop` / `interaction.segment` 类动作类型（或把段信息挂到 `interaction.start`）；新增「按状态分组 + 向下兼容挑选」纯函数 | 通用 |
| database | 一次纯加法迁移：`motion_assets` 增加「情绪档位 / 关系等级门槛 / 段标记」列（或新增段表），旧记录按 `Single` + `Default` 组降级 | 仅 VRM（该表是 VRM 动作表） |
| core | 动作服务读写新列；不改校验口径（仍是 GLB 魔数 + 扩展标记双校验） | 仅 VRM |
| web | `MotionMixer` 升级为动作条目调度器（A/B/C + 循环段维持）；`VrmPoseLayer` 承接循环段的幅度加深 | 仅 VRM |
| web | 命中盒补齐双击/滑动手势；**`Live2dController` 与 `VrmController` 的公开契约均不改动** | 通用 |
| desktop | 拖拽桥新增速度采样与惯性/贴边驱动；窗口移动逐帧化 | 通用 |
| 资源 | 内置动作需补三段式素材（A/B/C）；Live2D 侧若日后跟进需重导出 Cubism 工程 | 仅 VRM（后者明确不做） |

## 5. 里程碑拆分

| 里程碑 | 内容 | 出口 | 状态 |
|---|---|---|---|
| M0 契约冻结 | 动作段契约、动画图条目类型、迁移列设计、**后端作用域确认（本版口径）** | 类型与迁移评审通过，旧数据降级路径明确，Live2D 零改动被写进验收项 | ✅ `3cdd0dc` |
| M1 段调度（VRM） | `MotionMixer` 支持 A/B/C，按住进循环段、松手走退场段 | 长按有「抬手 → 维持 → 放下」三段；单击行为不回归 | ✅ `fadf573` |
| M2 状态驱动（策略通用 / 候选集 VRM） | shared 增加分组与向下兼容查找纯函数；VRM 动作池按档位分组 | 情绪/等级切换见效；任何状态下都有可播动作 | ✅ `5ced854` |
| M3 拖拽物理与手势（通用） | 速度采样、惯性滑行、贴边回正、滑动/双击手势 | 甩出去有惯性、边缘能回正；手势表补齐；**2D 与 3D 形象下同款生效** | ✅ `b324b23` |
| M4 收口 | 配置化、过渡段（P2 视时间）、真机验收与门禁 | 行数门禁/E2E/真机三尺寸全部通过；**2D 形象回归无差异** | ⏳ 见第 8 节 |

## 6. 风险与取舍

- **VRMA 没有天然的 A/B/C**。真实导入的动作就是一段循环动画，「三段式」是我们给它加的调度层。取舍：**不强制拆段**，内置动作提供三段式示范，用户导入的动作按整段处理；拆段能力做成可选（导入时标注），不做自动切分（自动切分算法不可靠，切错比不切更糟）。
- **两后端的动作模型不可统一**。硬要一套模型会落到「最小公倍数」，两边都变差。取舍：**策略层共用、执行层分侧**——共用部分（门控、手势、物理、分组查找）做成 shared 纯函数；执行部分各自实现，VRM 先行。不为 Live2D 引入 VRMA 式的段模型。
- **「策略通用」不能被误读成「2D 也已升级」**。本版交付后，2D 用户只能感知到「手势变多、拖拽有惯性」；待机动作仍由既有的 idle 组随机调度决定。取舍：把这句写进版本文档与验收项，避免期望落空。
- **惯性/抛掷与窗口移动耦合**。窗口位置由主进程控制，逐帧移动会与拖拽桥的状态机竞争。取舍：移动期间禁用命中区重算与穿透切换，移动结束再统一恢复（与 VPet 的 `Checked` 失败即放弃移动同思路）。
- **状态驱动的冷启动问题**。新用户没有情绪数据、没有关系等级，分组全部落空。取舍：必须有 `Default` 组兜底，且内置动作常驻——这条 v2.1 已经成立，直接复用。
- **配置化的度**。动画图配置化容易演变成「万物皆可配置」，最终没人敢改。取舍：只配置「区域/手势/状态 → 动作条目」这一层，动作类型与执行顺序仍留在代码里。

## 7. Non-Goals（本版明确不做）

- **不为 Live2D（2D）做动作模型改造**：不新增按状态分档的 motion group、不做长按维持、不做档位过渡动画——这些都需要重导出 Cubism 资源，本版顺延；2D 侧只承接后端无关的手势、门控与拖拽物理；
- 不引入 2D 帧动画体系（PNG 序列 / APNG / 合图缓存 / 内存闸门）——我们是骨骼动画，套不上；
- 不做养成数值系统（体力、饥饿、金钱、工作/学习/玩耍）——本产品定位是陪伴与工作助手，不做宠物养成游戏；
- 不做自主漫游（爬墙、自由走动）——只做「贴边 + 抛掷惯性」的手感，不做 AI 自主移动；
- 不做多桌宠；
- 不放开外部 Live2D 模型导入（授权边界不变）；
- 不改动作导入的校验口径与免责声明流程；
- 不改 `ControllerLike` 公开契约（新增能力一律走可选调用或后端自有接口）。

## 8. M4 交付状态（收口）

### 8.1 已交付（M0–M3）

| 里程碑 | 代码锚点 |
|---|---|
| M0 | `packages/shared/src/schemas/motion-asset.ts`、`packages/database/src/migrations/v033-motion-segments.ts`、`packages/core/src/services/motion-service.ts`、`docs/plan/v2.2/02-动作段与动画图契约.md` |
| M1 | `apps/web/src/features/avatar/motion-segments.ts`（条目聚合 + 段位退化）、`motion-hold.ts`（A→B→C 调度）、`motion-clips.ts`、`motion-fit-sampler.ts`、`vrm-motion-mixer.ts`、`vrm-controller.ts` |
| M2 | `packages/shared/src/schemas/motion-selection.ts`（档位分组 + 兼容挑选 + `motionMoodOf`）、`interaction-resolvers.ts#relationshipLevelName`、`packages/shared/src/pet.ts`（`relationship` 表现事件）、`use-chat-pet-relay.ts` / `use-pet-bridge.ts` / `pet-stage.tsx`（真源接线）、`vrm-motion-mixer.ts#setPreference` |
| M3 | `apps/desktop/src/main/pet/pet-throw-physics.ts`、`pet-throw-controller.ts`、`pet-drag-controller.ts`（速度采样）、`pet-manager.ts`（接线）、`interaction-resolvers.ts#touchTriggerKey` + `touch:body:double`、`pet-hit-regions.tsx`（身体盒双击） |

### 8.2 门禁结果（本机）

- `pnpm check`（typecheck 全包 + lint + 行数门禁）：8/8 任务通过；行数门禁 0 error（36 个 260–300 行预警文件均为历史项，其中本版新增/改动者：`pet-manager.ts` 278、`vrm-canvas.tsx` 284、`vrm-motion-mixer.ts` 290、`pet-hit-regions.tsx` 261）；
- `pnpm test`（全包单测/集成）：8/8 任务通过（web 92 文件 / 488 例；shared、database、core、desktop、ai、voice、config 全绿）；
- 本版新增单测：`motion-segments`(7)、`vrm-motion-mixer`(3)、`motion-selection`(12)、`interaction-resolvers`(6)、`pet` 表现事件净化(1)、`pet-throw-physics`(6)、`pet-throw-controller`(6)、`pet-drag-controller`(+2)。

### 8.3 待办与顺延（需真机，本机无法执行）

- **真机三尺寸验收**（需 Windows + 真实多显示器）：长按三段式手感的视觉确认；甩出去惯性与贴边回正；双击身体的角色动作；2D（Live2D）形象下拖拽惯性同款、其余行为回归无差异；
- **E2E**（`pnpm test:e2e` / `test:e2e:desktop`，需 Playwright 浏览器与 Electron 打包产物）：本机未执行，留待 CI/真机；
- **P1-1 交互动画图配置化**：属 P1「争取」项。体量与风险（引入数据驱动的动作选择 + 配置界面 + 持久化，且需保持「查不到返回空」语义）足以独立成一个里程碑，**本版暂缓**；
- **P2-1 情绪档位过渡动画**（仅 VRM）：需为内置动作补 `Switch_Up/Switch_Down` 过渡段素材，属资源成本，按计划顺延；
- **P2-2 事件链接线**（context/system/relationship 事件的 Resolver 解析）：v2.1 遗留，本版未接。

