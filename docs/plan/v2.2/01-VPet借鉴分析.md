# v2.2 借鉴分析：VPet 桌宠交互机制拆解与采纳判定

> 参考仓库：`e:\code\github\VPet-main`（虚拟桌宠模拟器，C# / WPF，2D 帧动画体系）。
> 本文只做**机制拆解与取舍**，不改动该仓库。事实来源：仓库内 `wiki/04-动画系统.md`（168 行，作者自述的动画系统说明）与下列源码文件的**存在性与职责**已核对，行数为实测。
>
> 已核对的文件（相对 `VPet-main`）：
>
> ```text
> wiki/04-动画系统.md                      168 行  动画系统说明（本分析主要事实来源）
> VPet-Simulator.Core/Graph/GraphInfo.cs   296 行  动画类型与身份枚举定义
> VPet-Simulator.Core/Graph/GraphCore.cs   410 行  动画查找结构与宠物 Config
> VPet-Simulator.Core/Graph/IGraph.cs      158 行  单个动画的播放控制接口
> VPet-Simulator.Core/Display/Main.xaml.cs 635 行  主窗绑定与交互热区注册
> VPet-Simulator.Core/Display/MainDisplay.cs 711 行 交互动画链与数值联动
> VPet-Simulator.Core/Handle/GameCore.cs    76 行  TouchArea 命中结构
> ```

## 1. 动画身份模型：四元组

VPet 的每个动画由四层唯一确定（`wiki/04-动画系统.md`「动画身份模型」）：

```text
GraphType（动画类型，如 Touch_Head）
  └─ Name（用户自定义动画名，同名之间随机选）
       └─ ModeType（Happy / Nomal / PoorCondition / Ill 四状态）
            └─ AnimatType（Single / A_Start / B_Loop / C_End）
                 └─ IGraph 实例（一个具体资源）
```

三个关键点：

- **`GraphType` 枚举共 23 种**，其中 `Raised_Dynamic`、`Raised_Static`、`Default`、`Sleep`、`Say`、`StartUP`、`Work` 是**必须提供**的 7 种——缺 `Default` 直接报错中止启动。也就是说「待机动画」被当作硬契约，而不是可选装饰。
- **`ModeType` 是状态维度**，且状态之间**有兼容顺序**：查找时先精确匹配当前状态，`Ill` 找不到直接返回 null，其他状态先向更差状态兼容、再向上兼容，最后从非 `Ill` 实例里随机。设计意图在文档里说得很直白：**「MOD 只画了普通状态，也能在开心时播」**。
- **`Name` 层天然支持多变体**：同名动画之间随机取一个，等于把「同一语义的多个变体」做成了资源组织方式，不需要额外配置。

## 2. 三段式：`AnimatType` + 播放控制状态机

```csharp
public enum AnimatType { Single = 0, A_Start, B_Loop, C_End }
```

- `A_Start` 入场（播一次）→ `B_Loop` 持续段（可无限循环，也能被 `SetContinue()` 延长）→ `C_End` 退场（播一次后回 `Default`）。
- 播放由 `IGraph.TaskControl` 的**四态状态机**驱动：`Status_Quo → Continue/Stop → Status_Stoped`。接口 `IGraph` 只暴露 `Stop()` 与 `SetContinue()` 两个控制动作。

**这是我们最想借的一条**：它把「按住状态」表达成了动画层的一等语义——不是靠渲染层加抖动，而是靠「持续段可被延长」这件事。

## 3. 交互热区：配置里的矩形，按状态分档

`GraphCore.Config`（`GraphCore.cs` 内嵌类）从宠物描述文件读取热区：

| 配置行 | 内容 |
|---|---|
| `touchhead` / `touchbody` / `touchraised` / `pinch` | 500×500 画布内的矩形热区（px/py/sw/sh）；**`raised` 按 4 个状态各一组** |
| `raisepoint` | 提起时鼠标抓取点偏移（同样按状态） |
| `work` / `move` | 工作与移动的行为定义（多行） |

命中结构在 `Handle/GameCore.cs` 的 `TouchArea`：位置 + 大小 + 触发回调 + 是否长按，用一个 `Touch(Point)` 做命中判断。

判定之外，`Display/Main.xaml.cs` 里还有一层「自动注册交互热区」（侧边回正、摸头、摸身体、提起），`Display/MainDisplay.cs` 负责播放 `Touch_Head` / `Touch_Body` 的 A→B→C 链并联动数值。

> 对照我们的现状：热区是**写死的百分比盒子**（头部 27%、身体 62%），且 `raised` 只有一条配置，没有「同一区域在不同状态下不同形状/不同动作」的概念。VPet 的「热区按状态分档」值得我们评估，但优先级低于 P0-1/P0-3。

## 4. 移动与贴边：双层判定 + 靠边回正

`move` 配置（`wiki/04-动画系统.md`「Move 定义」）：

- `[Flags] DirectionType`：Left=1 / Right=2 / Top=4 / Bottom=8 及组合位；`LocateType` 决定开始时把窗口贴到哪条边；
- `ModeType` 是 `[Flags]`：Happy=2 / Nomal=4 / PoorCondition=8 / Ill=16——**同一条移动定义只在允许的状态下触发**；
- **`Trigger*` 决定「能否开始」、`Check*` 决定「移动中能否继续」**，默认触发距离 100；`SpeedX/SpeedY` 是每帧位移，`Interval` 默认 125ms，`Distance` 判定阈值 5；
- 生命周期：`Triggered → Display(A_Start) → Displaying(B_Loop 递归 + 逐帧移动窗口) → Checked 失败 → C_End`，结束后 `RePositionActive/CheckPosition` 靠边回正并触发 `Event_MoveEnd`。

**双层判定（开始阈值 vs 维持阈值）是关键设计**：只有这样才能在临界点附近不抖。我们 v2.2 的贴边回正要抄的正是这一条。

## 5. 资源组织与缓存（不采纳的部分）

VPet 用帧动画：`Picture` / `PNGAnimation` / `APNGAnimation` / `FoodAnimation` 四种 `IGraph` 实现，帧时长来自文件名或 APNG 的 fcTL；资源靠**路径关键词推断**身份（状态 / 类型 / 段 / 名称四层 token 匹配，优先级：配置文件 > 路径关键词 > 默认值）；渲染前把帧**横向合图缓存**到 `cache/`，配内存闸门与 30 秒一次的空闲清理（只保留当前帧 + 向前 2 帧）。

这些机制解决的是「2D 逐帧序列的加载与内存问题」，与我们的 3D 骨骼动画无关。**明确不采纳**：不引入帧序列/APNG/合图缓存/路径推断这一整套体系。但其中一条思路值得记下来——**「资源身份靠约定推断、且带显式配置兜底」**，与我们对 VRMA 的处理（默认整段 = 循环段，可选显式标注段）是同一种取舍。

## 6. 采纳判定表

| # | VPet 机制 | 出处 | 判定 | 理由 |
|---|---|---|---|---|
| 1 | `AnimatType` 三段式（A_Start / B_Loop / C_End） | `Graph/GraphInfo.cs`、`wiki/04-动画系统.md` | **采纳（P0-1）** | 让「按住」成为动画层语义，而不是渲染层硬凑；v2.1 的三段式状态机已有阶段，缺的正是动作层的段调度 |
| 2 | `B_Loop` 可被 `SetContinue()` 延长 | `Graph/IGraph.cs` | **采纳（P0-1）** | 长按维持的核心能力；对应我们 `interaction.loop` 阶段的「延长而不重开」语义 |
| 3 | `ModeType` 四状态 + 查找兼容顺序（向下 → 向上 → 任意非 Ill） | `wiki/04-动画系统.md`「查找规则 FindGraph」 | **采纳（P0-2）** | 状态驱动挑选必须有回退链，否则数据稀疏时会出现「无动作可播」 |
| 4 | 必须提供的 7 种动画类型，缺 `Default` 直接报错 | `wiki/04-动画系统.md`「必须提供的 7 种」 | **采纳（精神层面）** | 「待机动画是硬契约」——我们已经做到了内置动作常驻池，把它明确成契约并加校验 |
| 5 | `Move` 的 `Trigger*`/`Check*` 双层判定 | `wiki/04-动画系统.md`「Move 定义」 | **采纳（P0-3）** | 贴边与惯性移动在临界点的抖动问题，双层阈值是直接解 |
| 6 | 移动结束靠边回正 + 移动结束事件 | 同上（`RePositionActive/CheckPosition`、`Event_MoveEnd`） | **采纳（P0-3）** | 手感闭环：甩出去 → 停下 → 自动贴边，而不是停在哪里算哪里 |
| 7 | 热区按状态分档（`raised` 四状态各一组） | `Graph/GraphCore.cs` Config | 改造采纳（P1-1 之后评估） | 方向正确，但我们的热区是写死百分比盒，先做段调度与物理，热区分档排在后面 |
| 8 | 同名动画随机取一个（多变体） | `wiki/04-动画系统.md`「FindName」 | 采纳（P0-2 的实现方式） | 池内同组多个动作随机挑一个，等价于我们在做轮播时已有的随机挑选逻辑 |
| 9 | 帧序列 / APNG / 合图缓存 / 内存闸门 / 空闲清理 | 同上「合图（精灵图）与缓存」 | **不采纳** | 面向 2D 逐帧序列，与 3D 骨骼动画无关 |
| 10 | 路径关键词推断资源身份 | 同上「路径推断」 | **不采纳** | 我们的资源身份来自 VRM 扩展校验与文件元数据，不靠路径猜 |
| 11 | 工作 / 学习 / 玩耍等养成数值与 `work` 定义 | 同上「Work 定义」 | **不采纳** | 产品定位是陪伴与工作助手，不做宠物养成游戏（见方案 Non-Goals） |
| 12 | 爬墙 / 自由漫游（`DirectionType` 全向移动） | 同上「Move 定义」 | **不采纳（本版）** | 只做贴边 + 抛掷惯性，不做自主移动 |

## 6.1 作用域提示（与方案第 2 节对齐）

上表标「采纳」的机制并非全部同时落两个后端——本项目桌宠有 2D Live2D 与 3D VRM 两套渲染后端，动作模型不同：

- **只落 3D VRM**：第 1、2 条（`AnimatType` 段调度与 `SetContinue` 延长）。Live2D 的动作是 Cubism 的 motion group，一个 motion 自带 loop 标记与淡入淡出，没有「一段拆三段」的模型，故不引入段模型。
- **两后端共用（策略层）**：第 3、8 条的**查找策略**（状态分档 + 向下兼容顺序 + 同组随机）做成 shared 纯函数；第 7 条「热区按状态分档」的方向正确但排在段调度之后评估。
- **与后端无关**：第 5、6 条（双层阈值贴边、移动结束靠边回正）落在桌面壳窗口层，2D 与 3D 同款生效。

方案侧的完整逐条对照与兼容性保证见 [README.md](README.md) 第 2 节。

## 7. 不借鉴但值得记住的两条工程经验

- **状态兼容顺序必须显式定义并写成文档**（第 3 条）。VPet 把它写在 wiki 里并且给出了动机（「MOD 只画普通状态也能在开心时播」）。我们要照做：把「精确 → 向下兼容 → 向上兼容 → Default 兜底」写进方案与测试用例，而不是让它隐式散在代码里。
- **移动类交互一定要有结束态**（第 6 条）。VPet 的移动生命周期明确以 `C_End` + 靠边回正收尾，并且抛出 `Event_MoveEnd`。对照我们 v2.1 的拖拽：只有 `dragBegin/dragTo/dragEnd`，结束时没有任何「收尾姿态」——v2.2 的 P0-3 必须补上这一段。
