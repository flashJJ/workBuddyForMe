# 动效库 Wiki（Motion Library Wiki）

> 独立记录桌宠动效库的版本、变化、问题修复心得、改造方案与避坑点，供后续开发直接查阅。
> 主方案文档：[10-motion-library.md](../../plan/archive/v3/v3.0/pet-engine/10-motion-library.md)；逐日流水见 [progress-log.md](../../plan/archive/v3/v3.0/progress-log.md)。

## 当前版本

| 项 | 值 |
|---|---|
| 版本 | v3.0 / P5.5.35（2026-11-13） |
| 分层 | L1 姿势 → L2 动作 → L3 行为 → L4 剧本 |
| 核心运行时 | `VrmAnimationRuntime` + `Composer` + 世界方向执行器 + `BoneCrossFade` + `FrameLedger` |
| 当前行为数 | 15（含鞠躬/叉腰/托腮/打哈欠/拥抱/被拎起挣扎） |
| 回归 | animation 171 / script 72；golden 16 个行为快照 |

## 目录

- [architecture.md](./architecture.md)：动效库运行原理、剧情生成器原理与两者联动（Mermaid）。
- [changelog.md](./changelog.md)：版本与变更记录。
- [pitfalls.md](./pitfalls.md)：问题修复心得与避坑点。
- [plans.md](./plans.md)：改造方案与下一步。
- 代码入口：
  - `apps/web/src/features/avatar/animation/`
  - `animation/adapters/vrm-executors.ts`：世界方向执行器
  - `animation/adapters/vrm-gesture-arms.ts`：手势手臂目标
  - `animation/adapters/vrm-crossfade.ts`：行为切换交叉淡化
  - `animation/adapters/vrm-root.ts`：root 位移/摆动
  - `animation/arms/intents.ts`：手臂意图表（方向 + 掌心法线）
  - `animation/arms/solver.ts`：统一手臂求解器
  - `animation/frame/ledger.ts`：帧区域台账（owner / priority / 冲突）
  - `animation/frame/ownership.ts`：骨骼 → 阶段归属与固定拓扑序
  - `animation/frame/plan.ts`：写入前区域决议与 loser 拒绝
  - `animation/composer.ts`：轨道阶段拆分与 priority 合成
  - `animation/behaviors/`、`animation/motions/`、`animation/poses/`

## 记录规则

1. **改动即记录**：新增/修改 L1–L4 内容或执行器，必须更新 `changelog.md`；修复类问题同时补充 `pitfalls.md`。
2. **只追加不覆盖**：历史版本保留原条目，新版本另起一节，注明日期与版本号。
3. 每条记录包含：日期、版本、改动、原因、验证方式、遗留、相关文件。
4. **观感类改动必须真机验证**：至少给出截图、录屏或逐帧采样数据；未验证的标「待验收」。
5. **Golden 变更说明原因**：明确是预期观感变化还是回归；只在确认后执行 `vitest -u`。
6. 新避坑点写成「现象 → 根因 → 修复 → 规则」，避免只记结论。

## 新条目模板

```md
### YYYY-MM-DD 版本 / 标题

- 改动：
- 原因：
- 验证：
- 遗留：
- 文件：
```

## 快速排查顺序

1. 先看 `pitfalls.md` 是否有相同现象。
2. 看行为是否走世界方向执行器（`POSE_EXECUTORS`）还是欧拉姿势。
3. 看行为权重是否从 0 起步、退出是否降到 0。
4. 看运动时间是否真正传入执行器（`timeMs`），不要用固定 `t=0`。
5. 用 `__petDebug.behaviors` / 逐帧采样确认 phase、weight、骨骼世界方向。
6. 用 `__vrmDebug.controller.frameDebug` 看每个身体区域的当前写者与冲突，先确认唯一所有者。
7. 最后才调骨骼常数；优先修正语义（世界方向、时间、权重），再调数值。
