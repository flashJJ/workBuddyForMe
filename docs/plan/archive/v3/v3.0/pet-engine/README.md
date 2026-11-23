# 桌宠运行时技术调研：Mate-Engine 与同类项目可借鉴实现

> 目标：解释当前桌宠「效果差」的根因，给出可直接落到 Electron + Web 渲染栈的改造方案。
> 范围：窗口与命中、渲染性能、动画调度、交互与环境行为、资源与模组。
> 关联：[v3.0 肥鱼计划](../README.md)；对应阶段 P0-M1 之前的基础设施改造。

## 1. 问题定义

当前桌宠不是「模型不好看」，而是运行时细节不到位：

- **命中区是矩形**：`PET_HIT_DIP` 用 15%–85% 横向、11%–100% 纵向的固定比例，指针在角色轮廓外仍会打断穿透，在角色边缘内又可能穿透。
- **常驻全速渲染**：渲染层 `requestAnimationFrame` 常开，没有「交互 60 / 待机 30 / 隐藏 0」的分档，也没有失焦暂停。
- **动画各自为政**：待机、点击反应、拖拽、口型由不同定时器/控制器驱动，切换生硬，存在叠加风险（舞台角色失速就是同类问题）。
- **缺少环境交互**：不会坐窗口、坐任务栏、贴边探头、睡眠，观感像「悬浮贴纸」。
- **资源偏重**：单个 VRM 40 MB、21 张贴图，常驻内存与首帧都吃亏。

## 2. 调研对象

| 项目 | 技术栈 | 关键参考点 |
|---|---|---|
| [Mate-Engine](https://github.com/shinyflvre/Mate-Engine)（约 3.9k stars） | Unity + C# + UniVRM | 窗口坐立/任务栏、鼠标视线追踪、Q 版骨骼缩放、FPS 限制、内存回收、本地 LLM |
| [VPet-Simulator](https://github.com/LorisYounger/VPet) | WPF/C# | Core / Graph / Display 分层，桌宠核心可嵌入其他 WPF 应用 |
| Shimeji-ee | Java + XML 行为 | 行为树/动作 XML 化，窗口攀爬与抛掷 |
| [AionUi 桌宠](https://deepwiki.com/iOfficeAI/AionUi/13.5-desktop-pet-feature) | Electron | 渲染窗全穿透 + 独立命中窗的双窗模型 |
| [HAYA-PET](https://github.com/HAYASAKA7/HAYA-PET) | Electron | 透明 overlay + `setShape` 限定可交互区域 |
| Electron 官方 | — | `transparent`、`setIgnoreMouseEvents`、点击穿透语义 |

> 合规说明：Mate-Engine 为 AGPL v3 + 附加条款，**不复制其代码**，只借鉴思路与参数；所有实现按本项目代码规范重写。

## 3. 六个可借鉴结论（按收益排序）

1. **命中测试从矩形升级为「模型代理多边形 + 主进程 point-in-polygon」**  
   收益最大、改动最小。渲染层在模型加载/缩放时生成头部、身体、尾巴的屏幕空间多边形，主进程按光标做点在多边形内判定，替换固定比例矩形。

2. **帧率分档与不可见暂停**  
   交互 60 fps、待机 30 fps、窗口隐藏/最小化 0 fps；渲染层用累加器跳帧，主进程通过 `backgroundThrottling: false` 防止 Chromium 误节流，同时用可见性事件主动停。

3. **单一 AnimationDirector**  
   所有待机、触摸反应、拖拽、口型、睡眠走一个调度器：优先级 + 冷却 + crossfade + 打断规则。禁止每个控制器各起 `setTimeout`。

4. **Q 版不必改模型，运行时缩放骨骼**  
   Mate-Engine 的 `ChibiToggle` 用「整体骨架 0.3 + 头骨局部 2.7 + 大腿骨 0.6」实现大头短腿，再按脚底高度回正。无需重刷权重，也不会撕裂裙摆。

5. **环境交互是「活着」的关键**  
   窗口坐立、任务栏坐立、贴边探头、跟随前台窗口，比多加两个动作更能提升感知。Mate 用 Win32 枚举 + 顶边吸附 + 防抖；Electron 可用 `node-window-manager` 或 `koffi` 调用同一组 API。

6. **资源预算与回收**  
   贴图压到 1024/2048、模型 ≤ 20 MB、DPR ≤ 1.5、后处理默认关；换模型必须 `deepDispose` 并清空 PIXI/three 缓存；Mate 每 600 s 做一次 `GC + UnloadUnusedAssets + EmptyWorkingSet`，Electron 侧对应做「显式 dispose + 泄漏审计」。

## 4. 对标矩阵

| 能力 | Mate-Engine | 我们现状 | 建议 |
|---|---|---|---|
| 透明窗口 | Unity 分层窗 + DWM | Electron `transparent` + `setIgnoreMouseEvents` | 保留 |
| 点击穿透 | 射线命中 + `WS_EX_TRANSPARENT` | 主进程 60 Hz 光标轮询 + 矩形 | 升级为多边形命中 |
| 帧率控制 | 15–165 可调 | 常开 rAF | 60/30/0 三档 |
| 动画过渡 | Animator crossfade | 控制器各自调度 | AnimationDirector |
| 眼神/头追 | 头 45°/30°、脊柱 ±15°、眼 12° | 无（或仅 Live2D 视线） | 叠加式 LateUpdate 驱动 |
| 窗口坐立 | 支持（顶边吸附） | 无 | P1 用 Win32 枚举 |
| 任务栏坐立 | 支持 | 无 | P1 |
| Q 版模式 | 骨骼缩放 0.3/2.7/0.6 | 模型写实比例 | 运行时缩放 |
| 内存回收 | GC + EmptyWorkingSet | dispose 不完整 | 资源预算 + 泄漏测试 |
| 模组 | `.ME` + Steam Workshop | 无 | `pet-pack` 本地包 |
| 本地 LLM | Qwen 2.5 1.5B | 已有服务端对话 | 复用现有，不默认内置 |
| 多角色 | 最多 9 个 | 单窗单角色 | v3.1 评估 |

## 5. 文档索引

1. [01-architecture.md](./01-architecture.md)：进程、窗口、状态归属与 IPC 契约。
2. [02-window-hit-test.md](./02-window-hit-test.md)：透明窗、逐像素/多边形命中、拖拽、窗口与任务栏坐立。
3. [03-rendering-performance.md](./03-rendering-performance.md)：帧预算、Live2D/VRM 参数、纹理与内存、监控。
4. [04-animation-behavior.md](./04-animation-behavior.md)：AnimationDirector、待机调度、眼神追踪、Q 版缩放。
5. [05-interaction-mod-ai.md](./05-interaction-mod-ai.md)：触摸区域、手势、模组包、语音与 AI。
6. [06-benchmark-roadmap.md](./06-benchmark-roadmap.md)：指标、测试矩阵、分阶段落地与风险。
7. [07-p0-changelog.md](./07-p0-changelog.md)：P0 前两项（多边形命中、帧率三档）的落地变更摘要。
8. [08-script-architecture.md](./08-script-architecture.md)：剧本 DSL、表现套件（Kit）与 ScriptDirector，重构 3.0 的架构主轴。
9. [09-script-dev-plan.md](./09-script-dev-plan.md)：M0 开发规格——冲突定稿、契约、模块布局、任务拆分与准备清单。
10. [10-motion-library.md](./10-motion-library.md)：M0c 动效分层库——原子/姿势/动作/行为四层、合成语义、「被提起」拆解与任务拆分。
11. [11-motion-library-v2.md](./11-motion-library-v2.md)：M0d 动效库扩充——表情/视线执行器、L1–L3 内容扩容与 binding 方案（提案）。
12. [12-motion-plugin-feasibility.md](./12-motion-plugin-feasibility.md)：动效库解耦与插件化可行性——包拆分、数据包协议与迁移路径（探索）。
13. [13-human-pose-reference.md](./13-human-pose-reference.md)：人体姿势参考——关节舒适范围、自然手型、行为约束与评审清单。
14. [14-utility-decision.md](./14-utility-decision.md)：M3 Utility 决策层——硬门控之后的候选打分、理由码与设置页「最近决策」（阶段 1–3 已实施并真机验收）。

## 6. 优先级

| 阶段 | 内容 | 预期收益 |
|---|---|---|
| **P0** | 多边形命中、帧率三档、资源 dispose、单一动画调度 | 交互不再「鬼畜」，待机 CPU/GPU 明显下降 |
| **P1** | 眼神跟随、待机动作库、睡眠/唤醒、窗口坐立 | 从「贴纸」变成「在场」 |
| **P1.5** | 剧本 DSL、6 个表现 Kit、golden test 与 dev 预览（M0a）；原位换模型/资源回收/Q 版（M0b）；动效分层库（M0c） | 表现可复用、可预览、可回归（见 08/09/10） |
| **P2** | 任务栏坐立、贴边探头、模组包、多角色 | 可玩性与二创空间 |

## 7. 明确不做

- 不引入 Unity/独立原生渲染进程：现有 Electron + WebGL 已够用，换栈成本远大于收益。
- 不默认打包本地 LLM：Qwen 1.5B 级模型常驻内存 1–2 GB，与「轻量桌宠」冲突；保留服务端对话与可选离线包。
- 不复制 AGPL 代码、不内置受版权约束的角色素材。

Sources:
- [Mate-Engine](https://github.com/shinyflvre/Mate-Engine)
- [VPet-Simulator](https://github.com/LorisYounger/VPet)
- [AionUi Desktop Pet Feature](https://deepwiki.com/iOfficeAI/AionUi/13.5-desktop-pet-feature)
- [HAYA-PET architecture](https://github.com/HAYASAKA7/HAYA-PET)
- [Electron: Custom Window Interactions](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions)
- [Electron: Custom Window Styles](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles)
