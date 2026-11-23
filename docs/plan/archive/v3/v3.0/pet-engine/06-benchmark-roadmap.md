# 06 指标、测试矩阵与落地路线

> 结论：先做 P0 三件事（多边形命中、帧率三档、动画调度），就能解决大部分「效果差」；
> 窗口坐立/任务栏是 P1 的观感放大器；模组与多角色放 P2。

## 1. 验收指标

| 指标 | 目标 | 测量方式 |
|---|---|---|
| 命中准确率 | 轮廓外穿透 ≥ 99% | 沿角色边缘采样 200 点，记录点击落点 |
| 穿透切换延迟 | ≤ 16 ms | 高频日志打点（进入/离开命中区） |
| 待机 CPU | < 3% | 任务管理器 10 min 平均 |
| 待机 GPU | < 8% | 任务管理器/GPU-Z |
| 交互帧率 | 60 fps ± 2 | 渲染层 `PetPerf.fps` |
| 帧时间 p95 | 待机 < 33 ms，交互 < 20 ms | `PetPerf.frameP95Ms` |
| 常驻内存 | < 250 MB | 主进程 RSS + 渲染进程 |
| 首帧 | 缓存 < 1 s，冷启 < 3 s | 窗口 `ready-to-show` 到模型可见 |
| 拖拽抖动 | 0 次尺寸漂移 | 跨 DPI 拖动 20 次 |
| 长稳 | 4 h 无增长 | 每小时记录 RSS/JS heap |
| 动作冲突 | 0 次双主动作 | 日志审计 + 人工观察 |
| 坐立成功率 | ≥ 95% | 拖到窗口顶边 50 次 |

## 2. 测试矩阵

| 场景 | 步骤 | 关注 |
|---|---|---|
| 待机 | 打开后 1 h 不操作 | CPU/GPU/内存、眨眼/呼吸、无定时器堆积 |
| 拖拽 | 连续拖 100 次，含快速甩动 | 窗口尺寸、抛掷、落地、命中 |
| 边缘命中 | 指针沿头发/尾巴/身体边缘移动 | 穿透翻转次数、误点击 |
| DPI | 100/125/150/200% 切换 | 命中偏差、窗口尺寸 |
| 多屏 | 主副屏拖动、拔掉副屏 | clamp、位置恢复 |
| 全屏应用 | 打开全屏游戏/视频 | 是否遮挡、是否降帧/隐藏 |
| 睡眠/唤醒 | 系统睡眠 5 min 后唤醒 | 渲染恢复、音频、时钟跳变 |
| 换模型 | 连续切换 20 次 | 内存、首帧、SpringBone |
| 低端机 | 集显/老 CPU，均衡档 | 帧率、降档逻辑 |
| 长稳 | 4 h 挂机 + 间歇交互 | 泄漏、崩溃、日志 |

## 3. 分阶段落地

### P0（先做，1 个迭代内可验证）

1. **多边形命中**
   - 新增 `HitProxyBuilder`（渲染层）：Live2D `hitAreas` / VRM 骨骼包围盒 → 归一化多边形；
   - `pet-window.ts` 删除固定比例，`pet-hover-poller.ts` 改为 `pointInPolygon`；
   - 保留 180 ms 滞回与拖拽强制可交互。
2. **帧率三档**
   - 新增 `PerformanceGovernor`：`idle=30 / interact=60 / hidden=0`；
   - `live2d-stage.tsx`、`vrm-canvas.tsx` 统一接 governor；
   - `webPreferences.backgroundThrottling: false`，主动停 rAF。
3. **动画调度**
   - 新增 `AnimationDirector`，迁入待机/触摸/拖拽/口型；
   - 删除各控制器自己的 `setTimeout` 链。
4. **资源预算**
   - 换模型 `deepDispose` + PIXI destroy；
   - 贴图压到 1024、模型 ≤ 20 MB；
   - 原位换模型，不重建窗口。
5. **Q 版运行时开关**
   - `petChibiMode`：骨架 0.3、头 2.7、大腿 0.6、脚底回正；
   - 跑一遍尾巴/头发穿模检查。

### P1（观感提升）

- 光标视线追踪（头 45°/30°、脊柱 ±15°、眼 12°）；
- 待机动作库（呼吸/环顾/换重心/摸鱼/打哈欠）；
- 睡眠/唤醒；
- 窗口坐立：Win32 枚举 + 顶边吸附（probe 24 px、guard 240 px、15/8 fps）；
- 角色包 `pet-pack` 最小闭环（manifest + 模型 + 命中区）。

### P2（扩展）

- 任务栏四方向坐立；
- 贴边探头、跟随前台窗口；
- 逐像素 alpha 命中（64×64 掩码）；
- 多角色同屏（v3.1）；
- 可选离线 LLM 包。

## 4. 文件映射

| 改造 | 主要文件 |
|---|---|
| 命中多边形 | `apps/web/src/features/pet/*`、`apps/desktop/src/main/pet/pet-window.ts`、`pet-hover-poller.ts` |
| 帧率 governor | `apps/web/src/features/avatar/live2d/live2d-stage.tsx`、`vrm/vrm-canvas.tsx` |
| 动画调度 | `apps/web/src/features/avatar/live2d/controller.ts`、`features/pet/pet-stage.tsx` |
| 换模型 | `apps/desktop/src/main/pet/pet-manager.ts`、`apps/web/src/features/avatar/*` |
| 坐立 | 新增 `apps/desktop/src/main/pet/pet-presence.ts`（Win32/FFI） |
| Q 版 | `apps/web/src/features/avatar/vrm/*`、`live2d/*`、设置页 |
| 角色包 | 新增 `packages/core/src/pet-pack/*`、设置页导入 |

## 5. 风险

| 风险 | 影响 | 对策 |
|---|---|---|
| Win32 FFI 仅 Windows | macOS/Linux 无坐立 | 平台降级，不阻塞主流程 |
| 透明窗合成开销 | 低端机掉帧 | 省电档 + 关后处理 + DPR 1.0 |
| Live2D/VRM 双栈差异 | 两套动画/命中 | 统一接口，模型适配层隔离 |
| 角色包安全 | 恶意路径/超大文件 | 只读资源、路径校验、大小限制 |
| 过度工程 | 工期膨胀 | P0 只做命中/帧率/调度三件，其他按数据决定 |

## 6. 参考实现位置

- FPS：`Assets/MATE ENGINE - Scripts/Settings/FPSLimiter.cs`
- 窗口坐立：`Assets/MATE ENGINE - Scripts/AvatarHandlers/AvatarWindowHandler.cs`
- 视线追踪：`Assets/MATE ENGINE - Scripts/AvatarHandlers/AvatarMouseTracking.cs`
- Q 版缩放：`Assets/MATE ENGINE - Scripts/AvatarHandlers/ChibiToggle.cs`
- 内存回收：`Assets/MATE ENGINE - Scripts/Tools/MemoryTrim.cs`
- 透明/命中：`Assets/MATE ENGINE - Packages/Kirurobo/UniWindowController/Runtime/Scripts/UniWindowController.cs`

Sources:
- [Mate-Engine](https://github.com/shinyflvre/Mate-Engine)
- [VPet-Simulator](https://github.com/LorisYounger/VPet)
- [AionUi Desktop Pet Feature](https://deepwiki.com/iOfficeAI/AionUi/13.5-desktop-pet-feature)
- [HAYA-PET architecture](https://github.com/HAYASAKA7/HAYA-PET)
- [Electron: Custom Window Interactions](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions)
- [three-vrm](https://github.com/pixiv/three-vrm)
